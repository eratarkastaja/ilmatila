import { formatNumber, t } from './i18n.js';
import { getNearestMetricThreshold } from '../campaign/strategic-metrics.js';

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
    this.historyList = documentObject.querySelector('#campaign-history-list');
    this.storesList = documentObject.querySelector('#campaign-stores-list');
    this.storesNote = documentObject.querySelector('#campaign-stores-note');
    this.sustainment = documentObject.querySelector('#campaign-sustainment');
    this.sustainmentStatus = documentObject.querySelector('#campaign-sustainment-status');
    this.sustainmentDescription = documentObject.querySelector('#campaign-sustainment-description');
    this.sustainmentChoices = documentObject.querySelector('#campaign-sustainment-choices');
    this.onSustainmentChoice = null;
    this.onNewRun = null;
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
    this.overview.hidden = !campaign;
    if (!campaign) this.hideDebrief();
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
    const planned = this.scaleStores(current, resolution.mission.campaignLoadoutScale ?? 1);
    const selected = session.selectedSustainmentChoice;
    const forecast = this.scaleStores(
      session.getStoresAfterChoice(selected?.id),
      resolution.mission.campaignLoadoutScale ?? 1,
    );
    const rows = [
      ['airMissiles', 'campaign.stores.airMissiles'],
      ['groundMissiles', 'campaign.stores.groundMissiles'],
      ['gunRounds', 'campaign.stores.gunRounds'],
      ['flares', 'campaign.stores.flares'],
      ['chaff', 'campaign.stores.chaff'],
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
      this.storesNote.textContent = selected
        ? t('campaign.stores.forecastChoice', { choice: t(selected.titleKey) })
        : t('campaign.stores.forecastNone');
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
    for (const entry of entries) {
      const item = this.documentObject.createElement('li');
      const chapter = session.definition.chapters.find(candidate => candidate.id === entry.chapterId);
      const title = chapter ? t(chapter.titleKey) : entry.chapterId;
      const score = Number.isFinite(entry.score) && entry.score > 0
        ? ` · ${t('campaign.history.score', { score: entry.score })}`
        : '';
      item.textContent = `${title} · ${t(`campaign.debrief.${entry.classification}`)}${score}`;
      this.historyList.append(item);
    }
  }

  renderSustainment(session) {
    if (!this.sustainment) return;
    const decision = session.currentSustainmentDecision;
    if (!decision || session.completed) {
      this.sustainment.hidden = true;
      return;
    }
    const selected = session.selectedSustainmentChoice;
    this.sustainment.hidden = false;
    if (this.sustainmentStatus) {
      this.sustainmentStatus.textContent = session.state.sustainmentUsed
        ? t('campaign.sustainment.consumed')
        : selected
        ? t('campaign.sustainment.selected')
        : t('campaign.sustainment.available');
    }
    if (this.sustainmentDescription) this.sustainmentDescription.textContent = t(decision.descriptionKey);
    if (!this.sustainmentChoices) return;
    this.sustainmentChoices.replaceChildren();
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
