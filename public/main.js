/* ===== Алхимия маркетинга — interactions ===== */

// ===== Scroll reveal =====
(() => {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => io.observe(el));
})();

// ===== Hero metric chips =====
(() => {
  const values = document.querySelectorAll('.metric-chip-value');
  if (!values.length) return;

  const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
  const nextDelay = () => randomInt(4600, 8600);

  values.forEach((value) => {
    const min = Number(value.dataset.min || 40);
    const max = Number(value.dataset.max || 220);

    const tick = () => {
      const current = Number((value.textContent || '').replace(/\D/g, '')) || 0;
      let next = randomInt(min, max);
      if (next === current) next = next >= max ? min : next + 1;

      value.classList.add('is-changing');
      window.setTimeout(() => {
        value.textContent = `▲ +${next}%`;
        value.classList.remove('is-changing');
      }, 280);
      window.setTimeout(tick, nextDelay());
    };

    window.setTimeout(tick, nextDelay());
  });
})();

// ===== Smooth anchor scroll (account for sticky header) =====
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id === '#' || id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ===== Form: analyze link =====
(() => {
  const form = document.getElementById('analyzeForm');
  if (!form) return;
  const btn = document.getElementById('submitBtn');
  const btnLabel = btn.querySelector('.btn-label');
  const btnLoading = btn.querySelector('.btn-loading');
  const btnArrow = btn.querySelector('.btn-arrow');
  const result = document.getElementById('result');
  const resultMessage = document.getElementById('resultMessage');
  const resultDetail = document.getElementById('resultDetail');

  function setLoading(loading) {
    btn.disabled = loading;
    btnLabel.classList.toggle('hidden', loading);
    btnArrow.classList.toggle('hidden', loading);
    btnLoading.classList.toggle('hidden', !loading);
    btn.style.opacity = loading ? '0.85' : '1';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      url: form.url.value.trim(),
      name: form.name.value.trim(),
      clinic: form.clinic.value.trim(),
      channel: form.channel.value,
      contact: form.contact.value.trim(),
    };
    if (!data.url || !data.name || !data.contact) {
      result.classList.remove('hidden');
      result.style.borderColor = 'rgba(232, 120, 120, 0.4)';
      resultMessage.textContent = 'Заполните, пожалуйста, ссылку, имя и контакт.';
      resultDetail.innerHTML = '';
      return;
    }

    setLoading(true);
    result.classList.add('hidden');

    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error || 'Ошибка отправки');

      result.classList.remove('hidden');
      result.style.borderColor = '';
      resultMessage.innerHTML = `Спасибо, <strong>${escapeHTML(data.name)}</strong>. Ответим в&nbsp;${channelLabel(data.channel)} в&nbsp;течение рабочего дня.`;

      // Pre-check summary
      const pre = json.preview || {};
      const rows = [];
      if (pre.domain) rows.push(['Площадка', pre.domain]);
      if (pre.type) rows.push(['Тип площадки', pre.type]);
      if (pre.note) rows.push(['Первая заметка', pre.note]);
      rows.push(['Заявка №', json.id]);
      resultDetail.innerHTML = rows.map(([k, v]) =>
        `<div class="flex justify-between gap-4 py-1.5 border-t border-white/5 first:border-t-0">
          <span class="text-cream/55">${escapeHTML(k)}</span>
          <span class="text-cream/85 font-mono text-xs text-right">${escapeHTML(v)}</span>
        </div>`
      ).join('');

      form.reset();
    } catch (err) {
      result.classList.remove('hidden');
      result.style.borderColor = 'rgba(232, 120, 120, 0.4)';
      resultMessage.textContent = 'Не удалось отправить заявку. Напишите напрямую в Telegram @bokov9 — обработаем вручную.';
      resultDetail.innerHTML = '';
    } finally {
      setLoading(false);
    }
  });

  function channelLabel(c) {
    return c === 'telegram' ? 'Telegram' : c === 'max' ? 'MAX' : 'по&nbsp;телефону';
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
})();

// ===== Header shadow on scroll =====
(() => {
  const header = document.querySelector('header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 8) header.classList.add('shadow-lg');
    else header.classList.remove('shadow-lg');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ===== Lightbox for proof screenshots =====
(() => {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  const closeBtn = document.getElementById('lightboxClose');

  function open(src, caption) {
    img.src = src;
    img.alt = caption || '';
    cap.textContent = caption || '';
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
  }
  function close() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    // delay clearing src to allow fade out
    setTimeout(() => { img.removeAttribute('src'); }, 250);
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-proof]');
    if (trigger) {
      e.preventDefault();
      open(trigger.getAttribute('data-proof'), trigger.getAttribute('data-caption') || '');
    }
  });

  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
