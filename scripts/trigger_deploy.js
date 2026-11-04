#!/usr/bin/env node
/**
 * scripts/trigger_deploy.js
 * 
 * 安全触发 Render Web 前端或 AI 后端手动部署 Webhook。
 * 密钥统一从本地受 .gitignore 保护的 .env 中加载，杜绝明文硬编码外泄。
 * 
 * 用法：
 *   node scripts/trigger_deploy.js web      # 触发前端生产部署
 *   node scripts/trigger_deploy.js ai       # 触发 AI 后端测试部署
 *   node scripts/trigger_deploy.js web --dry-run
 */

const fs = require('fs');
const path = require('path');

// 简单轻量环境变量解析器（避免引入额外 npm 依赖）
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
  return env;
}

function maskUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const key = parsed.searchParams.get('key');
    if (key) {
      const maskedKey = key.length > 4 ? key.substring(0, 3) + '***' : '***';
      parsed.searchParams.set('key', maskedKey);
    }
    return parsed.toString();
  } catch {
    return urlStr.replace(/key=[^&]+/g, 'key=***');
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const envFromRoot = loadEnvFile(path.join(rootDir, '.env'));
  const envFromWeb = loadEnvFile(path.join(rootDir, 'web', '.env.local'));
  const mergedEnv = { ...envFromWeb, ...envFromRoot, ...process.env };

  const args = process.argv.slice(2);
  const target = (args[0] || '').toLowerCase();
  const isDryRun = args.includes('--dry-run');

  if (!target || !['web', 'frontend', 'ai', 'backend'].includes(target)) {
    console.error('❌ 请指定合法的部署目标：');
    console.error('   node scripts/trigger_deploy.js web       (触发前端生产部署)');
    console.error('   node scripts/trigger_deploy.js ai        (触发 AI 后端测试部署)');
    console.error('   node scripts/trigger_deploy.js <target> --dry-run (仅校验配置)');
    process.exit(1);
  }

  const isWeb = target === 'web' || target === 'frontend';
  const envKey = isWeb ? 'RENDER_WEBHOOK_FRONTEND' : 'RENDER_WEBHOOK_AI_BACKEND';
  const serviceLabel = isWeb ? 'Web 前端 (生产端)' : 'AI 后端 (测试端)';
  const webhookUrl = mergedEnv[envKey];

  if (!webhookUrl) {
    console.error(`❌ 未在 .env 或环境变量中找到 [${envKey}]。`);
    console.error(`   请在项目根目录 .env 中配置：`);
    console.error(`   ${envKey}=https://api.render.com/deploy/srv-xxxx?key=xxxx`);
    process.exit(1);
  }

  if (!webhookUrl.startsWith('https://api.render.com/deploy/')) {
    console.error(`❌ [${envKey}] URL 格式异常，必须以 https://api.render.com/deploy/ 开头。`);
    process.exit(1);
  }

  const masked = maskUrl(webhookUrl);
  console.log(`\n🚀 [Render Deploy Trigger] 准备触发部署...`);
  console.log(`   目标服务: ${serviceLabel}`);
  console.log(`   Webhook : ${masked}`);
  console.log(`   时间戳  : ${new Date().toISOString()}`);

  if (isDryRun) {
    console.log(`\n🔍 [Dry Run] 配置校验通过，未发起实际网络请求。`);
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'TalentFlow-Deploy-Tool/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const bodyText = await res.text();
    if (res.ok) {
      console.log(`\n✅ 部署已成功触发！[HTTP ${res.status}]`);
      try {
        const json = JSON.parse(bodyText);
        console.log(`   Deploy ID: ${json.deploy?.id || 'N/A'}`);
        console.log(`   Status   : ${json.deploy?.status || 'initiated'}`);
      } catch {
        console.log(`   响应内容 : ${bodyText || '(空响应)'}`);
      }
    } else {
      console.error(`\n❌ 部署触发失败！[HTTP ${res.status}]`);
      console.error(`   响应内容 : ${bodyText}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ 网络请求异常:`, err.message);
    process.exit(1);
  }
}

main();
