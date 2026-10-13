import { t } from './i18n.js';

function signed(value) {
  if (!value) return '±0';
  return value > 0 ? `+${value}` : String(value);
}

/** Presents campaign state without owning campaign or sortie lifecycle. */
export class CampaignView {
  constructor(documentObject = document) {
    this.standaloneModeButton = documentObject.querySelector('#standalone-mode');
    this.campaignModeButton = documentObject.querySelector('#campaign-mode');
    this.standaloneSelection = documentObject.querySelector('#standalone-mission-selection');
    this.overview = documentObject.querySelector('#campaign-overview');
    this.progress = documentObject.querySelector('#campaign-progress-label');
    this.title = documentObject.querySelector('#campaign-title');
    this.day = documentObject.querySelector('#campaign-day');
    this.description = documentObject.querySelector('#campaign-description');
    this.ending = documentObject.querySelector('#campaign-ending');
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
  }

  renderDebrief(preview) {
    this.debriefActions.hidden = false;
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
  }

  hideDebrief() {
    this.debriefActions.hidden = true;
    this.continueButton.hidden = false;
    this.continueButton.disabled = false;
  }
}
