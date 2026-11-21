import { api } from '../api.js';
import {
  choiceLabel,
  clientDecisionIcon,
  escapeAttr,
  escapeHtml,
  formatDate,
  icon,
  money,
  percent,
  priceChip,
  propertyAlt,
  propertyImage,
  relativeTime,
  toast,
} from '../ui.js';

function priceReadBlock(data) {
  const summary = data.priceSummary;
  if (!summary || !summary.count) return '';
  const delta = summary.medianDeltaPct;
  const tone = delta > 0 ? 'warn' : delta < 0 ? 'good' : 'neutral';
  return `<section class="portal-price-read">
    <div class="portal-price-icon">${icon('chart', 22)}</div>
    <div class="portal-price-copy">
      <span class="kicker">Asking-price check</span>
      <strong>${escapeHtml(summary.narrative)}</strong>
      <span>${summary.count} of your homes have comparable evidence. This is an asking-price read, not a valuation; the team confirms condition and availability.</span>
    </div>
    <div class="portal-price-stats">
      <span><b>${delta === null ? '—' : percent(delta)}</b><span>median vs market</span></span>
      <span><b>${summary.above}</b><span>above median</span></span>
      <span><b>${summary.below}</b><span>below median</span></span>
    </div>
  </section>`;
}

function specRow(listing) {
  return `<div class="portal-specs">
    <span>${icon('bed', 15)} ${listing.bedrooms} bed</span>
    <span>${icon('bath', 15)} ${listing.bathrooms} bath</span>
    <span>${icon('ruler', 15)} ${listing.areaM2} m²</span>
    <span>${icon('home', 15)} ${escapeHtml(listing.type)}</span>
    ${listing.available ? `<span>${icon('calendar', 15)} from ${escapeHtml(formatDate(listing.available, 'month'))}</span>` : ''}
  </div>`;
}

function decisionControls(item, selected, submitted) {
  if (submitted) {
    if (!item.clientDecision || item.clientDecision === 'pending') {
      return `<div class="portal-decision-readonly muted">No response recorded for this home.</div>`;
    }
    return `<div class="portal-decision-readonly">
      <span class="decision-chip decision-${item.clientDecision === 'interested' ? 'good' : item.clientDecision === 'not_for_us' ? 'muted' : 'warn'}">
        ${icon(clientDecisionIcon(item.clientDecision), 13)} ${escapeHtml(choiceLabel(item.clientDecision))}
      </span>
      ${item.clientComment ? `<p>${escapeHtml(item.clientComment)}</p>` : ''}
    </div>`;
  }
  const choiceButton = (value, label) => `<button class="portal-choice ${selected.decision === value ? 'is-active' : ''} portal-choice-${value}" type="button" data-choice="${value}" aria-pressed="${selected.decision === value}">
    ${icon(value === 'interested' ? 'check' : value === 'not_for_us' ? 'x' : 'alert', 15)}
    <span>${label}</span>
  </button>`;
  return `<div class="portal-decision">
    <p>Would you like to see this one?</p>
    <div class="portal-choice-row">
      ${choiceButton('interested', 'Interested')}
      ${choiceButton('question', 'Ask a question')}
      ${choiceButton('not_for_us', 'Not for us')}
    </div>
    <label class="portal-comment ${selected.decision ? 'is-visible' : ''}" data-comment-wrap>
      <span>${selected.decision === 'question' ? 'Your question for the team' : 'Anything we should know?'} <em>optional</em></span>
      <textarea class="input textarea" rows="2" data-comment placeholder="e.g. Is the pool heated? Could we visit in January?">${escapeHtml(selected.comment || '')}</textarea>
    </label>
  </div>`;
}

function feedbackSummary(data) {
  if (!data.feedback) return '';
  const interested = data.items.filter((item) => item.clientDecision === 'interested').length;
  return `<section class="portal-thanks" id="portal-thanks">
    <span class="portal-thanks-icon">${icon('check-circle', 28)}</span>
    <span class="kicker">Feedback received</span>
    <h2>Thank you, ${escapeHtml(data.clientName.split('&')[0].trim().split(' ')[0] || data.clientName)}.</h2>
    <p>${data.feedback.overall === 'refine' ? 'Your notes are with the team. They will come back with a revised shortlist rather than making you repeat yourself.' : 'The team will be in touch to arrange the next step.'}${interested ? ` You marked ${interested} home${interested === 1 ? '' : 's'} as interesting.` : ''}</p>
    <div class="portal-thanks-meta">
      <span>${icon('clock', 14)} Sent ${escapeHtml(relativeTime(data.feedback.createdAt))}</span>
      <span>${icon('user', 14)} ${escapeHtml(data.feedback.submittedBy || data.clientName)}</span>
      <span>${icon('flag', 14)} ${data.feedback.overall === 'refine' ? 'Revision requested' : 'Shortlist accepted'}</span>
    </div>
    ${data.feedback.comment ? `<blockquote class="portal-feedback-quote">“${escapeHtml(data.feedback.comment)}”</blockquote>` : ''}
  </section>`;
}

export async function renderPortal(main, route) {
  const token = route.token || route.id;
  const data = await api.portal(token);
  const submitted = Boolean(data.feedback);
  const firstName = data.clientName.split('&')[0].trim().split(' ')[0] || data.clientName;
  const state = new Map(
    data.items.map((item) => [
      item.id,
      {
        decision: item.clientDecision && item.clientDecision !== 'pending' ? item.clientDecision : null,
        comment: item.clientComment || '',
      },
    ])
  );
  let overall = data.feedback?.overall || null;

  main.innerHTML = `<div class="portal-page">
    <header class="portal-header">
      <span class="portal-brand">
        <span class="portal-brand-mark">${icon('sparkles', 18)}</span>
        <span><strong>Farol</strong><em>Property Buy or Rent</em></span>
      </span>
      <span class="portal-header-meta">Prepared for ${escapeHtml(data.clientName)} <span class="dot-sep">·</span> ${escapeHtml(data.ref)}</span>
    </header>

    <section class="portal-hero">
      <div class="portal-hero-media" aria-hidden="true"></div>
      <div class="portal-hero-copy">
        <span class="kicker">Your property shortlist</span>
        <h1>${escapeHtml(data.items.length)} homes worth your time, ${escapeHtml(firstName)}.</h1>
        <p>${escapeHtml(data.summary || 'We have narrowed the search to a small set of homes that fit the brief, the budget and the way you want to live. Each one is here for a reason.')}</p>
        <div class="portal-hero-meta">
          <span>${icon('user', 14)} Prepared by ${escapeHtml(data.owner)}</span>
          <span>${icon('calendar', 14)} ${escapeHtml(formatDate(data.sharedAt, 'long'))}</span>
          <span>${icon('home', 14)} ${data.items.length} homes</span>
        </div>
      </div>
    </section>

    <div class="portal-body">
      ${priceReadBlock(data)}
      <div class="portal-homes">
        ${data.items
          .map(
            (item, index) => `<article class="portal-home" data-item-id="${escapeAttr(item.id)}">
              <div class="portal-home-media">
                <img src="${propertyImage(item.listing)}" alt="${escapeAttr(propertyAlt(item.listing))}" loading="lazy" />
                <span class="portal-rank">${String(index + 1).padStart(2, '0')}</span>
                <span class="portal-home-price">${money(item.listing.price, { period: data.transaction === 'rent' ? 'month' : null })}</span>
              </div>
              <div class="portal-home-body">
                <div class="portal-home-loc">${icon('pin', 14)} ${escapeHtml(item.listing.city)}${item.listing.area ? ` · ${escapeHtml(item.listing.area)}` : ''}</div>
                <h2>${escapeHtml(item.listing.title)}</h2>
                ${specRow(item.listing)}
                ${item.rationale ? `<p class="portal-rationale">${escapeHtml(item.rationale)}</p>` : ''}
                <div class="portal-price-line">
                  ${priceChip(item.listing.priceCheck)}
                  ${item.listing.priceCheck?.available ? `<span>Comparable median ${money(item.listing.priceCheck.median, { period: data.transaction === 'rent' ? 'month' : null })} · ${item.listing.priceCheck.count} homes</span>` : '<span>Comparable evidence is thin for this home.</span>'}
                </div>
                ${decisionControls(item, state.get(item.id), submitted)}
              </div>
            </article>`
          )
          .join('')}
      </div>

      ${submitted
        ? feedbackSummary(data)
        : `<section class="portal-response" id="portal-response">
            <div class="portal-response-copy">
              <span class="kicker">Over to you</span>
              <h2>Does this shortlist feel right?</h2>
              <p>Mark each home, add a note if you want to, and tell us whether to keep going or refine the search. The team reads every response.</p>
            </div>
            <div class="portal-response-form">
              <label class="field">
                <span class="field-label">Anything you want the team to know? <em>optional</em></span>
                <textarea class="input textarea" id="overall-comment" rows="4" placeholder="Timing, a street you love, something the shortlist is missing…"></textarea>
              </label>
              <div class="overall-choices" role="group" aria-label="Overall response">
                <button class="overall-choice" type="button" data-overall="accept" aria-pressed="false">
                  <span class="overall-choice-icon">${icon('check-circle', 20)}</span>
                  <span><strong>This shortlist works</strong><em>Keep going with these homes</em></span>
                </button>
                <button class="overall-choice" type="button" data-overall="refine" aria-pressed="false">
                  <span class="overall-choice-icon">${icon('refresh', 20)}</span>
                  <span><strong>Please refine</strong><em>Use my notes for the next iteration</em></span>
                </button>
              </div>
              <button class="button button-primary portal-submit" type="button" id="submit-feedback">
                ${icon('send', 16)} Send my feedback
              </button>
              <p class="portal-privacy">${icon('shield', 13)} Only the Property Buy or Rent team sees your response.</p>
            </div>
          </section>`}
    </div>

    <footer class="portal-footer">
      <span>Farol · Property Buy or Rent · ${escapeHtml(data.ref)}</span>
      <span>Indicative asking-price analysis, not a formal valuation · demo shortlist</span>
    </footer>
  </div>`;

  if (submitted) return () => {};

  // Choice state.
  data.items.forEach((item) => {
    const card = main.querySelector(`[data-item-id="${CSS.escape(item.id)}"]`);
    if (!card) return;
    card.querySelectorAll('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.choice;
        const current = state.get(item.id);
        current.decision = current.decision === value ? null : value;
        state.set(item.id, current);
        card.querySelectorAll('[data-choice]').forEach((other) => {
          const active = other.dataset.choice === current.decision;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        const wrap = card.querySelector('[data-comment-wrap]');
        if (wrap) {
          wrap.classList.toggle('is-visible', Boolean(current.decision));
          const label = wrap.querySelector('span');
          if (label) {
            label.innerHTML = current.decision === 'question'
              ? 'Your question for the team <em>optional</em>'
              : 'Anything we should know? <em>optional</em>';
          }
        }
        if (current.decision === 'question') {
          card.querySelector('[data-comment]')?.focus({ preventScroll: true });
        }
      });
    });
    const comment = card.querySelector('[data-comment]');
    comment?.addEventListener('input', () => {
      const current = state.get(item.id);
      current.comment = comment.value;
      state.set(item.id, current);
    });
  });

  // Overall response.
  main.querySelectorAll('[data-overall]').forEach((button) => {
    button.addEventListener('click', () => {
      overall = button.dataset.overall;
      main.querySelectorAll('[data-overall]').forEach((other) => {
        const active = other.dataset.overall === overall;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
    });
  });

  const overallComment = main.querySelector('#overall-comment');
  const submitButton = main.querySelector('#submit-feedback');
  submitButton?.addEventListener('click', async () => {
    const decisions = data.items
      .map((item) => {
        const current = state.get(item.id);
        return {
          shortlistItemId: item.id,
          decision: current.decision || 'pending',
          comment: current.comment || '',
        };
      })
      .filter((decision) => decision.decision !== 'pending' || decision.comment);
    const comment = String(overallComment?.value || '').trim();
    if (!overall) {
      toast('Choose whether the shortlist works or needs refining.', { tone: 'error' });
      return;
    }
    if (overall === 'refine' && !comment && decisions.length === 0) {
      toast('Add a note so the team knows what to change.', { tone: 'error' });
      return;
    }
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner"></span>Sending your feedback…';
    try {
      const updated = await api.portalFeedback(token, {
        overall,
        comment,
        submittedBy: data.clientName,
        decisions,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      main.innerHTML = '';
      await renderPortal(main, { token });
      toast('Feedback sent. The team will follow up shortly.', { tone: 'success' });
    } catch (error) {
      toast(error.message, { tone: 'error' });
      submitButton.disabled = false;
      submitButton.innerHTML = `${icon('send', 16)} Send my feedback`;
    }
  });

  return () => {};
}
