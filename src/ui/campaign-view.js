import { formatNumber, t } from './i18n.js';
import { getNearestMetricThreshold } from '../campaign/strategic-metrics.js';
import {
  AIR_WEAPON_OPTIONS,
  GROUND_WEAPON_OPTIONS,
  getKitHardpoints,
  getKitWeight,
  validateKit,
} from '../campaign/campaign-kit.js';

function signed(value) {
  if (!value) return '±0';
  const formatted = formatNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
}

/** Presents campaign state without owning campaign or sortie lifecycle. */
export class CampaignView {
  constructor(documentObject = document) {
    this.documentObject = documentObject;
    this.standaloneModeButton = documentObject.querySelector('#standalone-mode');
    this.campaignModeButton = documentObject.querySelector('#campaign-mode');
    this.standaloneSelection = documentObject.querySelector('#standalone-mission-selection');
    this.overview = documentObject.querySelector('#campaign-overview');
    this.progress = documentObject.querySelector('#campaign-progress-label');
    this.title = documentObject.querySelector('#campaign-title');
    this.day = documentObject.querySelector('#campaign-day');
    this.description = documentObject.querySelector('#campaign-description');
    this.situation = documentObject.querySelector('#campaign-situation');
    this.ending = documentObject.querySelector('#campaign-ending');
    this.newRunButton = documentObject.querySelector('#campaign-new-run');
    this.historyDialog = documentObject.querySelector('#campaign-history-dialog');
    this.historyOpen = documentObject.querySelector('#campaign-history-open');
    this.historyClose = documentObject.querySelector('#campaign-history-close');
    this.historyList = documentObject.querySelector('#campaign-history-list');
    this.storesList = documentObject.querySelector('#campaign-stores-list');
    this.storesNote = documentObject.querySelector('#campaign-stores-note');
    this.sustainment = documentObject.querySelector('#campaign-sustainment');
    this.sustainmentDialog = documentObject.querySelector('#campaign-sustainment-dialog');
    this.sustainmentOpen = documentObject.querySelector('#campaign-sustainment-open');
    this.sustainmentClose = documentObject.querySelector('#campaign-sustainment-close');
    this.standaloneKitOpen = documentObject.querySelector('#standalone-kit-open');
    this.kitForm = documentObject.querySelector('#campaign-kit-form');
    this.kitRecommended = documentObject.querySelector('#campaign-kit-recommended');
    this.kitLimits = documentObject.querySelector('#campaign-kit-limits');
    this.kitMassReadout = documentObject.querySelector('#campaign-kit-mass-readout');
    this.kitMassFill = documentObject.querySelector('#campaign-kit-mass-fill');
    this.kitHardpointsReadout = documentObject.querySelector('#campaign-kit-hardpoints-readout');
    this.kitHardpoints = documentObject.querySelector('#campaign-kit-hardpoints');
    this.sustainmentStatus = documentObject.querySelector('#campaign-sustainment-status');
    this.sustainmentTitle = documentObject.querySelector('#campaign-sustainment-title');
    this.sustainmentDescription = documentObject.querySelector('#campaign-sustainment-description');
    this.sustainmentChoices = documentObject.querySelector('#campaign-sustainment-choices');
    this.onSustainmentChoice = null;
    this.onNewRun = null;
    this.onKitChange = null;
    this.onStandaloneKitOpen = null;
    this.updateSustainmentOverflow = () => {
      if (!this.sustainmentDialog) return;
      const hasOverflow = this.sustainmentDialog.scrollHeight > this.sustainmentDialog.clientHeight + 1;
      this.sustainmentDialog.classList.toggle('has-overflow', hasOverflow);
    };
    this.sustainmentOpen?.addEventListener('click', () => {
      this.sustainmentDialog?.showModal();
      this.updateSustainmentOverflow();
      globalThis.requestAnimationFrame?.(() => this.updateSustainmentOverflow());
    });
    this.sustainmentClose?.addEventListener('click', () => this.sustainmentDialog?.close());
    this.standaloneKitOpen?.addEventListener('click', () => this.onStandaloneKitOpen?.());
    this.historyOpen?.addEventListener('click', () => this.historyDialog?.showModal());
    this.historyClose?.addEventListener('click', () => this.historyDialog?.close());
    this.stateNodes = {
      airControl: {
        value: documentObject.querySelector('#campaign-air-control-value'),
        fill: documentObject.querySelector('#campaign-air-control-fill'),
        next: documentObject.querySelector('#campaign-air-control-next'),
      },
      defenseIntegrity: {
        value: documentObject.querySelector('#campaign-defense-integrity-value'),
        fill: documentObject.querySelector('#campaign-defense-integrity-fill'),
        next: documentObject.querySelector('#campaign-defense-integrity-next'),
      },
      sortieReadiness: {
        value: documentObject.querySelector('#campaign-sortie-readiness-value'),
        fill: documentObject.querySelector('#campaign-sortie-readiness-fill'),
        next: documentObject.querySelector('#campaign-sortie-readiness-next'),
      },
    };
    this.debriefActions = documentObject.querySelector('#campaign-debrief-actions');
    this.debriefTitle = documentObject.querySelector('#campaign-debrief-title');
    this.debriefChanges = documentObject.querySelector('#campaign-debrief-changes');
    this.debriefNarrative = documentObject.querySelector('#campaign-debrief-narrative');
    this.debriefObjectiveEffects = documentObject.querySelector('#campaign-debrief-objective-effects');
    this.retryButton = documentObject.querySelector('#campaign-retry-sortie');
    this.continueButton = documentObject.querySelector('#campaign-continue');
  }

  setMode(mode) {
    const campaign = mode === 'campaign';
    this.standaloneModeButton.classList.toggle('selected', !campaign);
    this.standaloneModeButton.setAttribute('aria-pressed', String(!campaign));
    this.campaignModeButton.classList.toggle('selected', campaign);
    this.campaignModeButton.setAttribute('aria-pressed', String(campaign));
    this.standaloneSelection.hidden = campaign;
    if (this.standaloneKitOpen) this.standaloneKitOpen.hidden = campaign;
    this.overview.hidden = !campaign;
    if (!campaign) {
      this.hideDebrief();
      this.sustainmentDialog?.close();
      this.historyDialog?.close();
      if (this.sustainmentOpen) this.sustainmentOpen.hidden = true;
      if (this.historyOpen) this.historyOpen.hidden = true;
    }
  }

  renderSession(session) {
    const { definition, state, currentChapter } = session;
    const total = definition.chapters.length;
    this.title.textContent = t(definition.titleKey);
    this.description.textContent = t(definition.descriptionKey);
    this.progress.textContent = session.completed
      ? t('campaign.complete')
      : t('campaign.progress', { current: state.chapterIndex + 1, total });
    this.day.textContent = currentChapter ? t('campaign.day', { day: currentChapter.day }) : '';
    this.renderSituation(session);
    for (const [key, nodes] of Object.entries(this.stateNodes)) {
      const value = state[key];
      nodes.value.textContent = String(value);
      nodes.fill.style.width = `${value}%`;
      const threshold = getNearestMetricThreshold(key, value);
      if (nodes.next) {
        nodes.next.textContent = threshold
          ? t('campaign.metric.next', { threshold: threshold.value, effect: t(threshold.effectKey) })
          : '';
      }
    }
    this.ending.hidden = !session.completed;
    this.ending.textContent = session.completed && state.ending
      ? t(`campaign.ending.${state.ending}`)
      : '';
    if (this.newRunButton) {
      this.newRunButton.hidden = !session.completed;
      this.newRunButton.onclick = () => this.onNewRun?.();
    }
    if (this.historyOpen) this.historyOpen.hidden = false;
    this.renderSustainment(session);
    this.renderHistory(session);
    this.renderStores(session);
  }

  renderSituation(session) {
    if (!this.situation) return;
    const previous = session.state.history?.at(-1);
    if (!previous) {
      this.situation.textContent = t('campaign.situation.initial');
      return;
    }
    const chapter = session.definition.chapters.find(item => item.id === previous.chapterId);
    const wingmen = previous.wingmen?.total
      ? t('campaign.situation.wingmen', previous.wingmen)
      : '';
    this.situation.textContent = t(`campaign.situation.${previous.classification}`, {
      chapter: chapter ? t(chapter.titleKey) : previous.chapterId,
      wingmen,
    });
  }

  renderStores(session) {
    if (!this.storesList) return;
    const resolution = session.resolveCurrentMission();
    if (!resolution) {
      this.storesList.replaceChildren();
      if (this.storesNote) this.storesNote.textContent = '';
      return;
    }
    const current = session.getCurrentStores();
    const planned = this.scaleStores(session.getKitState().inventory, resolution.mission.campaignLoadoutScale ?? 1);
    const forecast = this.scaleStores(session.getKitState().selected, resolution.mission.campaignLoadoutScale ?? 1);
    const rows = [
      ['airMissiles', 'campaign.stores.airMissiles'],
      ['groundMissiles', 'campaign.stores.groundMissiles'],
      ['gunRounds', 'campaign.stores.gunRounds'],
      ['flares', 'campaign.stores.flares'],
      ['chaff', 'campaign.stores.chaff'],
      ['fuelMinutes', 'campaign.kit.fuel'],
    ];
    this.storesList.replaceChildren();
    for (const [key, labelKey] of rows) {
      const row = this.documentObject.createElement('div');
      const label = this.documentObject.createElement('span');
      label.textContent = t(labelKey);
      row.append(label, ...[current[key], planned[key], forecast[key]].map(value => {
        const cell = this.documentObject.createElement('b');
        cell.textContent = value === null ? '∞' : String(value ?? 0);
        return cell;
      }));
      this.storesList.append(row);
    }
    if (this.storesNote) {
      this.storesNote.textContent = t('campaign.stores.forecastKit');
    }
  }

  renderKit(session) {
    if (!this.kitForm) return;
    const kit = session.getKitState();
    const fields = [
      ['fuelMinutes', 'campaign.kit.fuel', 15],
      ['airMissiles', 'campaign.stores.airMissiles', 1],
      ['groundMissiles', 'campaign.stores.groundMissiles', 1],
      ['gunRounds', 'campaign.stores.gunRounds', 50],
      ['flares', 'campaign.stores.flares', 1],
      ['chaff', 'campaign.stores.chaff', 1],
    ];
    this.kitForm.replaceChildren();
    const selectFields = [
      ['airMissileType', 'campaign.kit.airWeapon', AIR_WEAPON_OPTIONS],
      ['groundMissileType', 'campaign.kit.groundWeapon', GROUND_WEAPON_OPTIONS],
    ];
    for (const [key, labelKey, options] of selectFields) {
      const label = this.documentObject.createElement('label');
      label.textContent = t(labelKey);
      const select = this.documentObject.createElement('select');
      select.dataset.key = key;
      for (const [value, option] of Object.entries(options)) {
        const item = this.documentObject.createElement('option');
        item.value = value;
        item.textContent = option.designation;
        item.selected = kit.selected[key] === value;
        select.append(item);
      }
      select.addEventListener('change', () => this.onKitChange?.({ ...kit.selected, [key]: select.value }));
      label.append(select);
      this.kitForm.append(label);
    }
    for (const [key, labelKey, step] of fields) {
      const label = this.documentObject.createElement('label');
      label.textContent = t(labelKey);
      const control = this.documentObject.createElement('span');
      control.className = 'campaign-kit-control';
      const change = value => {
        const next = { ...kit.selected, [key]: value };
        this.onKitChange?.(next);
      };
      const decrement = this.documentObject.createElement('button');
      decrement.type = 'button';
      decrement.className = 'campaign-kit-stepper';
      decrement.textContent = '−';
      decrement.setAttribute('aria-label', t('campaign.kit.decrease', { item: t(labelKey) }));
      decrement.addEventListener('click', () => {
        if (input.disabled) return;
        change(Math.max(0, Number(input.value || 0) - step));
      });
      const input = this.documentObject.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = String(step);
      input.dataset.key = key;
      input.value = Number.isFinite(kit.selected[key]) ? String(kit.selected[key]) : '';
      input.placeholder = kit.selected[key] === null ? '∞' : '';
      if (Number.isFinite(kit.inventory[key])) input.max = String(kit.inventory[key]);
      input.disabled = kit.selected[key] === null;
      input.addEventListener('change', () => {
        change(input.disabled ? null : Number(input.value));
      });
      const increment = this.documentObject.createElement('button');
      increment.type = 'button';
      increment.className = 'campaign-kit-stepper';
      increment.textContent = '+';
      increment.setAttribute('aria-label', t('campaign.kit.increase', { item: t(labelKey) }));
      increment.addEventListener('click', () => {
        if (input.disabled) return;
        const maximum = Number.isFinite(kit.inventory[key]) ? kit.inventory[key] : Infinity;
        change(Math.min(maximum, Number(input.value || 0) + step));
      });
      decrement.disabled = input.disabled;
      increment.disabled = input.disabled;
      control.append(decrement, input, increment);
      label.append(control);
      this.kitForm.append(label);
    }
    if (this.kitRecommended) {
      this.kitRecommended.onclick = () => this.onKitChange?.(kit.recommended);
    }
    if (this.kitLimits) {
      const hardpoints = getKitHardpoints(kit.selected);
      const weight = Math.round(getKitWeight(kit.selected));
      const status = validateKit(kit.selected, kit.inventory, kit.limits)
        ? t('campaign.kit.valid')
        : t('campaign.kit.invalid');
      this.kitLimits.textContent = t('campaign.kit.limits', {
        status,
        hardpoints,
        maxHardpoints: kit.limits.hardpoints,
        weight,
        maxWeight: kit.limits.payloadKg,
      });
      if (this.kitMassReadout) {
        this.kitMassReadout.textContent = t('campaign.kit.massReadout', {
          weight: formatNumber(weight),
          maxWeight: formatNumber(kit.limits.payloadKg),
          remaining: formatNumber(Math.max(0, kit.limits.payloadKg - weight)),
        });
      }
      if (this.kitMassFill) {
        this.kitMassFill.style.width = `${Math.min(100, (weight / kit.limits.payloadKg) * 100)}%`;
        this.kitMassFill.classList.toggle('over', weight > kit.limits.payloadKg);
      }
      if (this.kitHardpointsReadout) {
        this.kitHardpointsReadout.textContent = t('campaign.kit.hardpointsReadout', {
          used: hardpoints,
          max: kit.limits.hardpoints,
          remaining: Math.max(0, kit.limits.hardpoints - hardpoints),
        });
      }
      if (this.kitHardpoints) {
        this.kitHardpoints.replaceChildren();
        for (let index = 0; index < kit.limits.hardpoints; index += 1) {
          const slot = this.documentObject.createElement('span');
          const type = index < kit.selected.airMissiles
            ? 'air'
            : index < kit.selected.airMissiles + kit.selected.groundMissiles
              ? 'ground'
              : 'empty';
          const station = index < kit.limits.internalHardpoints ? 'internal' : 'external';
          slot.className = `campaign-kit-hardpoint ${type} ${station}`;
          slot.textContent = type === 'air' ? 'A' : type === 'ground' ? 'G' : '·';
          slot.setAttribute('aria-label', t(`campaign.kit.slot.${type}`));
          this.kitHardpoints.append(slot);
        }
      }
    }
  }

  showStandaloneKit(kit, onChange) {
    if (!this.sustainmentDialog || !this.sustainment) return;
    this.onKitChange = onChange;
    this.renderStandaloneKit(kit);
    this.sustainmentDialog.showModal();
    this.updateSustainmentOverflow();
    globalThis.requestAnimationFrame?.(() => this.updateSustainmentOverflow());
  }

  renderStandaloneKit(kit) {
    if (!this.sustainment || !this.sustainmentDialog) return;
    this.sustainment.hidden = false;
    if (this.sustainmentTitle) this.sustainmentTitle.textContent = t('campaign.kit.title');
    if (this.sustainmentStatus) this.sustainmentStatus.textContent = '';
    if (this.sustainmentDescription) this.sustainmentDescription.textContent = t('campaign.kit.description');
    if (this.sustainmentChoices) this.sustainmentChoices.hidden = true;
    const stores = this.sustainment.querySelector('.campaign-stores');
    if (stores) stores.hidden = true;
    this.renderKit({ getKitState: () => kit });
    if (this.sustainmentDialog.open) {
      this.updateSustainmentOverflow();
      globalThis.requestAnimationFrame?.(() => this.updateSustainmentOverflow());
    }
  }

  scaleStores(stores, scale) {
    return Object.fromEntries(Object.entries(stores).map(([key, value]) => [
      key,
      Number.isFinite(value) ? Math.max(0, Math.floor(value * scale)) : value,
    ]));
  }

  renderHistory(session) {
    if (!this.historyList) return;
    this.historyList.replaceChildren();
    const entries = session.state.history ?? [];
    if (!entries.length) {
      const empty = this.documentObject.createElement('li');
      empty.textContent = t('campaign.history.empty');
      this.historyList.append(empty);
      return;
    }
    for (const [index, entry] of entries.entries()) {
      const item = this.documentObject.createElement('li');
      item.className = 'campaign-history-entry';
      const chapter = session.definition.chapters.find(candidate => candidate.id === entry.chapterId);
      const title = chapter ? t(chapter.titleKey) : entry.chapterId;
      const entryHeader = this.documentObject.createElement('header');
      const entryTitle = this.documentObject.createElement('strong');
      entryTitle.textContent = `${String(index + 1).padStart(2, '0')} · ${title}`;
      const status = this.documentObject.createElement('b');
      status.textContent = t(`campaign.debrief.${entry.classification}`);
      entryHeader.append(entryTitle, status);
      const narrative = this.documentObject.createElement('p');
      narrative.textContent = t(`campaign.history.narrative.${entry.classification}`);
      item.append(entryHeader, narrative);

      const details = this.documentObject.createElement('div');
      details.className = 'campaign-history-details';
      this.appendHistoryDetail(details, 'campaign.history.scoreLabel', Number.isFinite(entry.score)
        ? formatNumber(entry.score)
        : '—');
      const wingmen = entry.wingmen && Number.isFinite(entry.wingmen.total)
        ? `${entry.wingmen.survived ?? 0} / ${entry.wingmen.total}`
        : '—';
      this.appendHistoryDetail(details, 'campaign.history.wingmen', wingmen);
      const changes = ['airControl', 'defenseIntegrity', 'sortieReadiness']
        .map(key => `${t(`campaign.${key}`)} ${signed(entry.changes?.[key] ?? 0)}`)
        .join(' · ');
      this.appendHistoryDetail(details, 'campaign.history.strategic', changes);
      item.append(details);

      if (entry.stores) {
        const stores = this.documentObject.createElement('p');
        stores.className = 'campaign-history-stores';
        stores.textContent = `${t('campaign.history.stores')}: ${[
          ['airMissiles', 'campaign.stores.airMissiles'],
          ['groundMissiles', 'campaign.stores.groundMissiles'],
          ['gunRounds', 'campaign.stores.gunRounds'],
          ['fuelMinutes', 'campaign.kit.fuel'],
        ].map(([key, labelKey]) => `${t(labelKey)} ${entry.stores[key] === null ? '∞' : entry.stores[key] ?? 0}`).join(' · ')}`;
        item.append(stores);
      }
      if (Array.isArray(entry.optionalObjectives) && entry.optionalObjectives.length) {
        const objectives = this.documentObject.createElement('p');
        objectives.className = 'campaign-history-objectives';
        objectives.textContent = `${t('campaign.history.objectives')}: ${entry.optionalObjectives.map(objective => {
          const titleKey = objective.type ? `mission.optionalObjective.${objective.type}.title` : null;
          const objectiveTitle = titleKey ? t(titleKey) : objective.id;
          return `${objectiveTitle} · ${t(`mission.optionalObjective.status.${objective.status}`)}`;
        }).join(' · ')}`;
        item.append(objectives);
      }
      this.historyList.append(item);
    }
  }

  appendHistoryDetail(container, labelKey, value) {
    const detail = this.documentObject.createElement('span');
    const label = this.documentObject.createElement('small');
    label.textContent = t(labelKey);
    const content = this.documentObject.createElement('b');
    content.textContent = value;
    detail.append(label, content);
    container.append(detail);
  }

  renderSustainment(session) {
    if (!this.sustainment) return;
    const decision = session.currentSustainmentDecision;
    if (session.completed) {
      if (this.sustainmentOpen) this.sustainmentOpen.hidden = true;
      if (this.sustainmentDialog?.open) this.sustainmentDialog.close();
      return;
    }
    if (this.sustainmentOpen) this.sustainmentOpen.hidden = false;
    this.sustainment.hidden = false;
    this.renderKit(session);
    const selected = session.selectedSustainmentChoice;
    if (this.sustainmentTitle) this.sustainmentTitle.textContent = t('campaign.sustainment.title');
    const stores = this.sustainment.querySelector('.campaign-stores');
    if (stores) stores.hidden = false;
    if (this.sustainmentChoices) this.sustainmentChoices.hidden = false;
    this.sustainment.hidden = false;
    if (this.sustainmentStatus) {
      this.sustainmentStatus.textContent = session.state.sustainmentUsed
        ? t('campaign.sustainment.consumed')
        : selected
        ? t('campaign.sustainment.selected')
        : t('campaign.sustainment.available');
    }
    if (this.sustainmentDescription) {
      this.sustainmentDescription.textContent = decision
        ? t(decision.descriptionKey)
        : t('campaign.kit.description');
    }
    if (!this.sustainmentChoices) return;
    this.sustainmentChoices.replaceChildren();
    if (!decision) return;
    for (const choice of decision.choices ?? []) {
      const button = this.documentObject.createElement('button');
      button.type = 'button';
      button.className = 'campaign-sustainment-choice';
      button.disabled = session.state.sustainmentUsed
        || session.state.sortieReadiness < choice.readinessCost;
      button.classList.toggle('selected', selected?.id === choice.id);
      button.setAttribute('aria-pressed', String(selected?.id === choice.id));
      const title = this.documentObject.createElement('strong');
      title.textContent = t(choice.titleKey);
      const description = this.documentObject.createElement('span');
      description.textContent = t(choice.descriptionKey);
      const cost = this.documentObject.createElement('small');
      cost.textContent = t('campaign.sustainment.cost', { readiness: choice.readinessCost });
      button.append(title, description, cost);
      button.addEventListener('click', () => this.onSustainmentChoice?.(choice.id));
      this.sustainmentChoices.append(button);
    }
  }

  renderDebrief(preview) {
    this.debriefActions.hidden = false;
    this.debriefObjectiveEffects?.replaceChildren();
    this.retryButton.hidden = false;
    this.continueButton.hidden = !preview.canAccept;
    this.continueButton.disabled = !preview.canAccept;
    if (!preview.canAccept) {
      this.debriefTitle.textContent = t('campaign.debrief.retryRequired');
      this.debriefChanges.textContent = `${t('campaign.debrief.noCommit')} ${t('campaign.debrief.retryCost', {
        readiness: preview.retryReadinessCost,
      })}`;
      return;
    }
    this.debriefTitle.textContent = t(`campaign.debrief.${preview.classification}`);
    if (this.debriefNarrative) this.debriefNarrative.textContent = t(preview.narrativeKey ?? 'campaign.debrief.narrative.success');
    this.debriefChanges.textContent = t('campaign.debrief.changes', {
      air: signed(preview.changes.airControl),
      defense: signed(preview.changes.defenseIntegrity),
      readiness: signed(preview.changes.sortieReadiness),
    });
    if (this.debriefObjectiveEffects) {
      this.debriefObjectiveEffects.replaceChildren();
      const effects = preview.optionalObjectiveChanges ?? [];
      if (!effects.length) {
        const empty = this.documentObject.createElement('li');
        empty.textContent = t('campaign.debrief.optional.none');
        this.debriefObjectiveEffects.append(empty);
      } else {
        for (const effect of effects) {
          const item = this.documentObject.createElement('li');
          const title = effect.type
            ? t(`mission.optionalObjective.${effect.type}.title`)
            : effect.id;
          const status = t(`mission.optionalObjective.status.${effect.status}`);
          const changes = Object.entries(effect.changes ?? {})
            .filter(([, value]) => value)
            .map(([key, value]) => `${t(`campaign.${key}`)} ${signed(value)}`)
            .join(' · ');
          item.textContent = `${title} · ${status} · ${changes || t('campaign.debrief.optional.noStateChange')}`;
          this.debriefObjectiveEffects.append(item);
        }
      }
    }
  }

  hideDebrief() {
    this.debriefActions.hidden = true;
    this.continueButton.hidden = false;
    this.continueButton.disabled = false;
    if (this.debriefNarrative) this.debriefNarrative.textContent = '';
    this.debriefObjectiveEffects?.replaceChildren();
  }
}
