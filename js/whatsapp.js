/**
 * WhatsApp Notification Module
 * Handles message template management and sending via local whatsapp_bot API
 */

window.WhatsAppModule = {
  templates: [],

  init() {
    this.loadTemplates();
    this.bindEvents();
    this.render();
  },

  loadTemplates() {
    const saved = localStorage.getItem('tf_whatsapp_templates');
    if (saved) {
      try {
        this.templates = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse templates', e);
        this.templates = this.getDefaultTemplates();
      }
    } else {
      this.templates = this.getDefaultTemplates();
      this.saveTemplates();
    }
  },

  saveTemplates() {
    localStorage.setItem('tf_whatsapp_templates', JSON.stringify(this.templates));
  },

  getDefaultTemplates() {
    return [
      {
        id: Utils.generateId(),
        name: '面试提醒',
        content: '你好 {Name}，提醒您明天参加 {Company} 的 {JobTitle} 岗位面试，请提前准备。'
      },
      {
        id: Utils.generateId(),
        name: '材料补交',
        content: '你好 {Name}，关于您申请的 {JobTitle} 岗位，麻烦您补交一下相关作品集/证明材料，谢谢。'
      },
      {
        id: Utils.generateId(),
        name: '录用通知',
        content: '恭喜 {Name}！您已成功通过 {Company} - {JobTitle} 岗位的面试！稍后我们会发送正式 Offer。'
      }
    ];
  },

  bindEvents() {
    const candidateSelect = document.getElementById('waCandidateSelect');
    const phoneInput = document.getElementById('waPhoneInput');
    const contentInput = document.getElementById('waMessageContent');
    const sendBtn = document.getElementById('waSendBtn');
    const clearBtn = document.getElementById('waClearBtn');
    const addTemplateBtn = document.getElementById('waAddTemplateBtn');

    // When a candidate is selected, autofill phone number
    if (candidateSelect) {
      candidateSelect.addEventListener('change', (e) => {
        const cId = e.target.value;
        if (!cId) {
          phoneInput.value = '';
          return;
        }
        const candidate = window.Store.getCandidateById(cId);
        if (candidate) {
          // If the candidate has a phone number, fill it. We might need to ensure it has country code.
          let phone = candidate.phone || '';
          // Remove non-numeric characters for basic cleanup (but keep + if present)
          phone = phone.replace(/[^\d+]/g, '');
          phoneInput.value = phone;
          
          // Optionally, auto-replace placeholders if content is already populated
          this.applyTemplateVariables(candidate);
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.handleSendMessage());
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (candidateSelect) candidateSelect.value = '';
        if (phoneInput) phoneInput.value = '';
        if (contentInput) contentInput.value = '';
      });
    }

    if (addTemplateBtn) {
      addTemplateBtn.addEventListener('click', () => this.handleAddTemplate());
    }
  },

  applyTemplateVariables(candidate) {
    const contentInput = document.getElementById('waMessageContent');
    if (!contentInput || !contentInput.value) return;

    let content = contentInput.value;
    const company = candidate.company || '';
    const jobTitle = candidate.jobTitle || '';
    const name = candidate.name || '';

    // We only replace if there are literal {Name}, {Company}, {JobTitle}
    // But since it's dynamic, if they already applied it, we shouldn't re-apply over hardcoded text.
    // It's safer to only apply when clicking a template.
  },

  render() {
    this.renderTemplates();
    this.renderCandidates();
  },

  renderTemplates() {
    const list = document.getElementById('waTemplateList');
    if (!list) return;

    if (this.templates.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">暂无模板</div>`;
      return;
    }

    list.innerHTML = this.templates.map(tpl => `
      <div class="template-item" style="padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); cursor: pointer; position: relative;">
        <div style="font-weight: 500; font-size: var(--text-sm); margin-bottom: var(--space-1);">${Utils.escapeHtml(tpl.name)}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${Utils.escapeHtml(tpl.content)}</div>
        <button class="btn-icon btn-sm delete-template-btn" data-id="${tpl.id}" style="position: absolute; top: var(--space-2); right: var(--space-2); padding: 2px;" title="删除模板">
          <i class="ph-light ph-trash" style="color: var(--accent-rose);"></i>
        </button>
      </div>
    `).join('');

    // Bind click on template item
    list.querySelectorAll('.template-item').forEach((el, index) => {
      el.addEventListener('click', (e) => {
        // Prevent click if clicking delete button
        if (e.target.closest('.delete-template-btn')) return;
        
        const tpl = this.templates[index];
        this.selectTemplate(tpl);
      });
    });

    // Bind delete
    list.querySelectorAll('.delete-template-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        Utils.confirmAction('确认删除', '您确定要删除这个消息模板吗？', () => {
          this.templates = this.templates.filter(t => t.id !== id);
          this.saveTemplates();
          this.renderTemplates();
          Utils.showToast('模板已删除');
        });
      });
    });
  },

  selectTemplate(tpl) {
    const contentInput = document.getElementById('waMessageContent');
    const candidateSelect = document.getElementById('waCandidateSelect');
    
    let content = tpl.content;

    // Try to inject variables if candidate is already selected
    if (candidateSelect && candidateSelect.value) {
      const candidate = window.Store.getCandidateById(candidateSelect.value);
      if (candidate) {
        content = content.replace(/{Name}/g, candidate.name || '')
                         .replace(/{Company}/g, candidate.company || '')
                         .replace(/{JobTitle}/g, candidate.jobTitle || '');
      }
    }

    if (contentInput) {
      contentInput.value = content;
      Utils.showToast(`已应用模板: ${tpl.name}`, 'success');
    }
  },

  renderCandidates() {
    const select = document.getElementById('waCandidateSelect');
    if (!select) return;

    const candidates = window.Store.candidates || [];
    // Save current selection
    const currentVal = select.value;

    select.innerHTML = `<option value="">-- 请选择候选人 --</option>` + 
      candidates.map(c => `
        <option value="${c.id}">${Utils.escapeHtml(c.name)} - ${Utils.escapeHtml(c.jobTitle)} (${Utils.escapeHtml(c.company)})</option>
      `).join('');

    if (currentVal && candidates.find(c => c.id === currentVal)) {
      select.value = currentVal;
    }
  },

  handleAddTemplate() {
    // We can use a simple prompt or just create a default new one for the user to edit
    const contentInput = document.getElementById('waMessageContent');
    if (!contentInput || !contentInput.value.trim()) {
      Utils.showToast('请先在右侧文本框输入模板内容，再点击新增', 'warning');
      return;
    }

    const tplName = prompt("请输入模板名称:", "新模板");
    if (!tplName) return;

    this.templates.push({
      id: Utils.generateId(),
      name: tplName,
      content: contentInput.value.trim()
    });
    this.saveTemplates();
    this.renderTemplates();
    Utils.showToast('模板保存成功', 'success');
  },

  async handleSendMessage() {
    const phoneInput = document.getElementById('waPhoneInput');
    const contentInput = document.getElementById('waMessageContent');
    const sendBtn = document.getElementById('waSendBtn');
    const statusMsg = document.getElementById('waStatusMessage');

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const message = contentInput ? contentInput.value.trim() : '';

    if (!phone) {
      Utils.showToast('请输入或选择候选人手机号', 'error');
      return;
    }
    if (!message) {
      Utils.showToast('请输入消息内容', 'error');
      return;
    }

    // Format phone: if missing country code, assume it's MY/CN (this could be improved, but user requested 60 prefix)
    let formattedPhone = phone;
    // Remove all non-digits for sending
    formattedPhone = formattedPhone.replace(/\D/g, '');

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span>发送中...</span><span class="btn-icon-circle"><i class="ph-bold ph-spinner ph-spin"></i></span>`;
    }
    if (statusMsg) statusMsg.textContent = '正在调用本地机器人接口...';

    try {
      const response = await fetch('http://localhost:8002/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, message })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Utils.showToast('WhatsApp 发送成功！', 'success');
        if (statusMsg) statusMsg.textContent = `成功发往 ${formattedPhone} - ${new Date().toLocaleTimeString()}`;
      } else {
        throw new Error(result.error || '未知错误');
      }
    } catch (err) {
      console.error('Send WA error:', err);
      Utils.showToast(`发送失败: ${err.message}`, 'error');
      if (statusMsg) {
        statusMsg.textContent = `发送失败，请确保 bot.js 正在运行端口 8002。`;
        statusMsg.style.color = 'var(--accent-rose)';
      }
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<span>发送 WhatsApp</span><span class="btn-icon-circle"><i class="ph-bold ph-paper-plane-right"></i></span>`;
      }
    }
  }
};
