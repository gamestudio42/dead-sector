import { loadContent } from '@dead-sector/content';
import { migrateCampaign, type CampaignState } from '@dead-sector/sim';
import { SaveStore } from './SaveStore';

const SLOT = 'campaign';
const QUICKSAVE_MODE = 'quicksave-mode';

/** The campaign in progress (IndexedDB with localStorage fallback, like saves). */
export const CampaignStore = {
  async load(): Promise<CampaignState | null> {
    const raw = await SaveStore.load(SLOT);
    if (!raw) return null;
    try {
      return migrateCampaign(loadContent(), JSON.parse(raw));
    } catch {
      return null;
    }
  },
  async save(c: CampaignState): Promise<void> {
    await SaveStore.save(SLOT, JSON.stringify(c));
  },
  async clear(): Promise<void> {
    await SaveStore.save(SLOT, '');
  },
  /** Whether the quicksave belongs to a campaign mission (so the debrief advances the campaign). */
  async setQuicksaveMode(campaign: boolean): Promise<void> {
    await SaveStore.save(QUICKSAVE_MODE, campaign ? 'campaign' : 'single');
  },
  async quicksaveIsCampaign(): Promise<boolean> {
    return (await SaveStore.load(QUICKSAVE_MODE)) === 'campaign';
  },
};
