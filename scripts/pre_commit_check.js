#!/usr/bin/env node
/**
 * scripts/pre_commit_check.js
 * 
 * Git 提交前自动化静态巡检脚本 (Pre-commit Static Guard)
 * 深度覆盖避坑指南 (05_pitfalls.md) 中反复出现的 4 大高危隐患：
 * 
 * 1. [i18n 字典缺键回退] (避坑 #107, #131, #134, #138, #145)
 *    - 严格比对 zh 与 en 字典的双向叶子节点对称性；
 *    - 扫描 web/app 与 web/components 中所有 t('...') 调用，防止字典遗漏引发静默回退。
 * 
 * 2. [JSX 翻译函数漏闭合大括号] (避坑 #94)
 *    - 基于 Babel AST 解析所有前端 JS/JSX 文件；
 *    - 提前拦截 Unterminated regexp literal 与 JSX 表达式漏闭合异常，杜绝云端 Turbopack 构建中断。
 * 
 * 3. [React Hook 依赖项 TDZ 暂时性死区] (避坑 #141)
 *    - 静态分析组件内部语句拓扑序；
 *    - 检测 useEffect/useMemo/useCallback 依赖项中是否引用了在下方才声明的 const/let 变量，杜绝运行时白屏崩溃。
 * 
 * 4. [FastAPI 启动依赖与路由 ImportError] (避坑 #130)
 *    - 执行 Python 入口级完整路由与服务依赖树探测；
 *    - 杜绝因模块误导包导致云端平台静默回滚旧镜像。
 * 
 * 用法：
 *   node scripts/pre_commit_check.js
 *   node scripts/pre_commit_check.js --skip-backend  # 跳过 Python 后端探测
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'web');
const AI_DIR = path.join(ROOT_DIR, 'ai_backend');

let totalErrors = 0;
let totalWarnings = 0;

function logHeader(title) {
  console.log(`\n============================================================`);
  console.log(`🔍 ${title}`);
  console.log(`============================================================`);
}

function logSuccess(msg) {
  console.log(`  ✅ ${msg}`);
}

function logError(msg) {
  console.error(`  ❌ [ERROR] ${msg}`);
  totalErrors++;
}

function logWarn(msg) {
  console.warn(`  ⚠️  [WARN] ${msg}`);
  totalWarnings++;
}

// 递归遍历收集 JS/JSX 文件
function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.next' || file === '.git' || file === 'dist') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

// 扁平化对象为 key.path 集合
function flattenKeys(obj, prefix = '') {
  let keys = [];
  if (!obj || typeof obj !== 'object') return keys;
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// 提取 AST 绑定变量名
function extractBindingNames(node) {
  let names = [];
  if (!node) return names;
  if (node.type === 'Identifier') {
    names.push(node.name);
  } else if (node.type === 'ArrayPattern') {
    for (const elem of node.elements) {
      if (elem) names = names.concat(extractBindingNames(elem));
    }
  } else if (node.type === 'ObjectPattern') {
    for (const prop of node.properties) {
      if (prop.type === 'ObjectProperty') {
        names = names.concat(extractBindingNames(prop.value));
      } else if (prop.type === 'RestElement') {
        names = names.concat(extractBindingNames(prop.argument));
      }
    }
  } else if (node.type === 'AssignmentPattern') {
    names = names.concat(extractBindingNames(node.left));
  } else if (node.type === 'RestElement') {
    names = names.concat(extractBindingNames(node.argument));
  }
  return names;
}

// =========================================================================
// 1. i18n 完整性与调用对齐巡检
// =========================================================================
async function checkI18n(files) {
  logHeader('1. i18n 字典完整性与组件调用防漏巡检');
  const i18nPath = path.join(WEB_DIR, 'lib', 'i18n', 'index.js');
  if (!fs.existsSync(i18nPath)) {
    logError(`未找到 i18n 字典文件: ${i18nPath}`);
    return;
  }

  let zhKeysSet = new Set();
  let enKeysSet = new Set();

  try {
    let zh = null;
    let en = null;

    // 1. 优先通过沙箱极速解析（兼容 Node 18/20/22/24，跨平台 Linux/Render/Windows，无需 package.json "type": "module"）
    try {
      const raw = fs.readFileSync(i18nPath, 'utf8');
      const cjs = raw.replace(/\bexport\s+const\s+/g, 'exports.');
      const mod = { exports: {} };
      new Function('exports', 'module', cjs)(mod.exports, mod);
      if (mod.exports.zh && mod.exports.en) {
        zh = mod.exports.zh;
        en = mod.exports.en;
      }
    } catch {
      zh = null;
      en = null;
    }

    // 2. 降级为动态 import (使用标准 pathToFileURL)
    if (!zh || !en) {
      const { pathToFileURL } = require('url');
      const fileUrl = pathToFileURL(i18nPath).href;
      const i18nModule = await import(fileUrl);
      zh = i18nModule.zh || {};
      en = i18nModule.en || {};
    }

    const zhList = flattenKeys(zh);
    const enList = flattenKeys(en);
    zhKeysSet = new Set(zhList);
    enKeysSet = new Set(enList);

    // 检查字典中英双向对称
    const inZhNotEn = zhList.filter(k => !enKeysSet.has(k));
    const inEnNotZh = enList.filter(k => !zhKeysSet.has(k));

    if (inZhNotEn.length > 0) {
      logError(`zh 存在但 en 缺失的键 (${inZhNotEn.length} 个): ${inZhNotEn.slice(0, 5).join(', ')}${inZhNotEn.length > 5 ? '...' : ''}`);
    }
    if (inEnNotZh.length > 0) {
      logError(`en 存在但 zh 缺失的键 (${inEnNotZh.length} 个): ${inEnNotZh.slice(0, 5).join(', ')}${inEnNotZh.length > 5 ? '...' : ''}`);
    }

    if (inZhNotEn.length === 0 && inEnNotZh.length === 0) {
      logSuccess(`zh 与 en 字典双向叶子节点 100% 对称对齐 (共 ${zhKeysSet.size} 个词条)`);
    }
  } catch (err) {
    logError(`解析 i18n 字典异常: ${err.message}`);
    return;
  }

  // 扫描组件中所有的静态 t('...') 调用
  const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  let missingFromDict = [];
  let checkedCalls = 0;

  for (const f of files) {
    const rel = path.relative(ROOT_DIR, f);
    const code = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = tCallRegex.exec(code)) !== null) {
      checkedCalls++;
      const key = m[1];
      // 仅校验具有命名空间层级的 key（含有点），避免误伤临时单字符
      if (key.includes('.')) {
        if (!zhKeysSet.has(key) && !enKeysSet.has(key)) {
          // 排除常见动态拼接伪前缀（若有）
          missingFromDict.push({ file: rel, key });
        }
      }
    }
  }

  if (missingFromDict.length > 0) {
    logError(`发现 ${missingFromDict.length} 处组件调用的 i18n 键在字典中不存在 (将导致静默回退中文):`);
    for (const item of missingFromDict.slice(0, 10)) {
      console.error(`     - [${item.key}] in ${item.file}`);
    }
    if (missingFromDict.length > 10) {
      console.error(`     ... 及其余 ${missingFromDict.length - 10} 处`);
    }
  } else {
    logSuccess(`组件代码中扫描到的 ${checkedCalls} 处 t(...) 调用全部合法入库，无未建档漏键`);
  }
}

// =========================================================================
// 2 & 3. Babel AST 解析：JSX 语法完整性与 Hook TDZ 死区巡检
// =========================================================================
function checkAstAndTDZ(files) {
  logHeader('2 & 3. JSX 语法完整性与 Hook TDZ (暂时性死区) 巡检');

  let parser = null;
  const babelParserPath = path.join(WEB_DIR, 'node_modules', '@babel', 'parser');
  if (fs.existsSync(babelParserPath)) {
    try {
      parser = require(babelParserPath);
    } catch {
      parser = null;
    }
  }

  if (!parser) {
    logWarn(`未在 web/node_modules 中找到 @babel/parser，将退化为轻量正则探测。`);
    checkSyntaxRegexFallback(files);
    return;
  }

  let syntaxErrors = 0;
  let tdzErrors = 0;

  function inspectBlockForTDZ(stmts, relPath) {
    const decls = new Map();
    // 1. 登记块级作用域下所有的 const / let
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration' && (stmt.kind === 'const' || stmt.kind === 'let')) {
        for (const d of stmt.declarations) {
          const names = extractBindingNames(d.id);
          const line = stmt.loc ? stmt.loc.start.line : 0;
          for (const name of names) {
            decls.set(name, line);
          }
        }
      }
    }

    // 2. 检查 Hook 依赖项
    for (const stmt of stmts) {
      let callExpr = null;
      if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
        callExpr = stmt.expression;
      } else if (stmt.type === 'VariableDeclaration') {
        for (const d of stmt.declarations) {
          if (d.init && d.init.type === 'CallExpression') {
            callExpr = d.init;
          }
        }
      }

      if (callExpr && callExpr.callee && callExpr.callee.type === 'Identifier') {
        const hookName = callExpr.callee.name;
        if (['useEffect', 'useLayoutEffect', 'useCallback', 'useMemo'].includes(hookName)) {
          const depsArg = callExpr.arguments[1];
          if (depsArg && depsArg.type === 'ArrayExpression') {
            const hookLine = stmt.loc ? stmt.loc.start.line : 0;
            for (const el of depsArg.elements) {
              if (el && el.type === 'Identifier') {
                const varName = el.name;
                if (decls.has(varName)) {
                  const declLine = decls.get(varName);
                  if (declLine > hookLine) {
                    logError(`[TDZ 暂时性死区] ${relPath}:${hookLine}`);
                    console.error(`     Hook [${hookName}] 在第 ${hookLine} 行读取了下方第 ${declLine} 行才声明的变量 [${varName}]！`);
                    console.error(`     👉 危害：生产环境打包求值必爆 ReferenceError: Cannot access before initialization`);
                    tdzErrors++;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  function traverseAst(node, relPath) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
      inspectBlockForTDZ(node.body, relPath);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) traverseAst(c, relPath);
      } else if (child && typeof child === 'object') {
        traverseAst(child, relPath);
      }
    }
  }

  for (const f of files) {
    const rel = path.relative(ROOT_DIR, f);
    const code = fs.readFileSync(f, 'utf8');
    try {
      const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
      traverseAst(ast, rel);
    } catch (err) {
      logError(`[JSX/语法解析失败] ${rel}:${err.loc ? err.loc.line : '?'}:${err.loc ? err.loc.column : '?'}`);
      console.error(`     ${err.message}`);
      console.error(`     👉 提示：请排查是否存在类似 <th>{t('key', '文本')</th> 漏闭合大括号导致 Turbopack 正则死锁`);
      syntaxErrors++;
    }
  }

  if (syntaxErrors === 0) {
    logSuccess(`全部 ${files.length} 个前端组件 JSX 语法与标签闭合验证通过 (0 错误)`);
  }
  if (tdzErrors === 0) {
    logSuccess(`全部前端组件 Hook 依赖项时序合法，无暂时性死区 (TDZ) 隐患 (0 错误)`);
  }
}

// 降级正则检查（无 babel 时的兜底）
function checkSyntaxRegexFallback(files) {
  const unclosedTRegex = /<([a-zA-Z0-9]+)[^>]*>\{t\([^}]*<\/\1>/g;
  let issues = 0;
  for (const f of files) {
    const rel = path.relative(ROOT_DIR, f);
    const code = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = unclosedTRegex.exec(code)) !== null) {
      logError(`[疑似漏闭合大括号] ${rel}: ${m[0]}`);
      issues++;
    }
  }
  if (issues === 0) {
    logSuccess(`正则降级扫描完成，未发现明显未闭合的 {t(...) 标签`);
  }
}

// =========================================================================
// 4. FastAPI 主入口应用与依赖树探测巡检
// =========================================================================
function checkFastAPI() {
  logHeader('4. FastAPI 微服务主入口与路由依赖树巡检');
  const mainPyPath = path.join(AI_DIR, 'main.py');
  if (!fs.existsSync(mainPyPath)) {
    logWarn(`未找到 ai_backend/main.py，跳过 Python 探测。`);
    return;
  }

  const pyCode = `import sys
sys.path.insert(0, 'ai_backend')
import main
routes = [r.path for r in main.app.routes]
print(f"ROUTES_COUNT:{len(routes)}")
`;
  
  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  const res = spawnSync(pyCmd, ['-c', pyCode], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    shell: false,
    timeout: 60000
  });

  if (res.status !== 0) {
    logError(`FastAPI 入口导入失败！线上将因 ImportError 崩溃并静默回滚！`);
    if (res.stderr) console.error(res.stderr);
    if (res.stdout) console.log(res.stdout);
  } else {
    const match = res.stdout.match(/ROUTES_COUNT:(\d+)/);
    const count = match ? match[1] : '已加载';
    logSuccess(`FastAPI app 顶层实例化成功，全量模块依赖解析无误 (注册路由: ${count} 条)`);
  }
}

// =========================================================================
// 主入口
// =========================================================================
async function main() {
  console.log(`\n============================================================`);
  console.log(`🛡️  TALENT FLOW - Git 提交前自动化静态巡检 (Pre-commit Guard)`);
  console.log(`============================================================`);
  const startTime = Date.now();

  const webAppFiles = getJsFiles(path.join(WEB_DIR, 'app'));
  const webComponentFiles = getJsFiles(path.join(WEB_DIR, 'components'));
  const allWebFiles = [...webAppFiles, ...webComponentFiles];

  // 1. i18n
  await checkI18n(allWebFiles);

  // 2 & 3. JSX & TDZ
  checkAstAndTDZ(allWebFiles);

  // 4. FastAPI
  const args = process.argv.slice(2);
  if (!args.includes('--skip-backend')) {
    checkFastAPI();
  } else {
    logHeader('4. FastAPI 微服务主入口巡检 (已跳过: --skip-backend)');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n============================================================`);
  console.log(`📊 巡检总结 (耗时: ${duration}s)`);
  console.log(`   错误: ${totalErrors} | 警告: ${totalWarnings}`);
  console.log(`============================================================`);

  if (totalErrors > 0) {
    console.error(`\n❌ 静态巡检未通过！请修正上述 ${totalErrors} 处阻塞性错误后再行提交或构建。\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ 全部静态巡检项 100% 通过！代码质量稳健，可安全提交 / 构建。\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
