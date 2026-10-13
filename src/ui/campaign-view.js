import { formatNumber, t } from './i18n.js';

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
    this.ending = documentObject.querySelector('#campaign-ending');
    this.sustainment = documentObject.querySelector('#campaign-sustainment');
    this.sustainmentStatus = documentObject.querySelector('#campaign-sustainment-status');
    this.sustainmentDescription = documentObject.querySelector('#campaign-sustainment-description');
    this.sustainmentChoices = documentObject.querySelector('#campaign-sustainment-choices');
    this.onSustainmentChoice = null;
    this.stateNodes = {
      airControl: {
        value: documentObject.querySelector('#campaign-air-control-value'),
        fill: documentObject.querySelector('#campaign-air-control-fill'),
      },
      defenseIntegrity: {
        value: documentObject.querySelector('#campaign-defense-integrity-value'),
        fill: documentObject.querySelector('#campaign-defense-integrity-fill'),
      },
      sortieReadiness: {
        value: documentObject.querySelector('#campaign-sortie-readiness-value'),
        fill: documentObject.querySelector('#campaign-sortie-readiness-fill'),
      },
    };
    this.debriefActions = documentObject.querySelector('#campaign-debrief-actions');
    this.debriefTitle = documentObject.querySelector('#campaign-debrief-title');
    this.debriefChanges = documentObject.querySelector('#campaign-debrief-changes');
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
    for (const [key, nodes] of Object.entries(this.stateNodes)) {
      const value = state[key];
      nodes.value.textContent = String(value);
      nodes.fill.style.width = `${value}%`;
    }
    this.ending.hidden = !session.completed;
    this.ending.textContent = session.completed && state.ending
      ? t(`campaign.ending.${state.ending}`)
      : '';
    this.renderSustainment(session);
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
      this.sustainmentStatus.textContent = selected
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
      button.disabled = session.state.sortieReadiness < choice.readinessCost;
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
      this.debriefChanges.textContent = t('campaign.debrief.noCommit');
      return;
    }
    this.debriefTitle.textContent = t(`campaign.debrief.${preview.classification}`);
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
    this.debriefObjectiveEffects?.replaceChildren();
  }
}
