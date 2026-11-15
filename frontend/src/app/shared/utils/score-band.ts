import { SCORE_THRESHOLDS } from './score-thresholds';

export interface ScoreBand {
  label: string;
  description: string;
  color: string;
}

const NO_SCORE: ScoreBand = {
  label: 'No score',
  description: 'No score available.',
  color: 'var(--color-score-good)',
};

const PENDING_SCORE: ScoreBand = {
  label: 'Pending',
  description: 'Add your first entry to activate your score.',
  color: 'var(--color-text-secondary)',
};

const BANDS: readonly (ScoreBand & { above: number })[] = [
  {
    above: SCORE_THRESHOLDS.great,
    label: 'Great',
    description: "You're looking really good!",
    color: 'var(--color-score-great)',
  },
  {
    above: SCORE_THRESHOLDS.good,
    label: 'Good',
    description: 'Keep it up, you can still make it!',
    color: 'var(--color-score-good)',
  },
  {
    above: SCORE_THRESHOLDS.couldDoMore,
    label: 'Could do more',
    description: 'Try to get back on track.',
    color: 'var(--color-score-could-do-more)',
  },
  {
    above: -Infinity,
    label: 'Needs work',
    description: 'Focus, you need to work a bit more on your progress.',
    color: 'var(--color-score-needs-work)',
  },
];

export function scoreBand(score: number | null, isPending: boolean = false): ScoreBand {
  if (score === null) {
    return NO_SCORE;
  }

  if (isPending) {
    return PENDING_SCORE;
  }

  return BANDS.find((band) => score > band.above) ?? NO_SCORE;
}

export interface ScoreBandRange extends ScoreBand {
  from: number;
  to: number;
}

export function scoreBandRanges(): ScoreBandRange[] {
  return BANDS.map((band, index) => {
    const better = BANDS[index - 1];

    return {
      label: band.label,
      description: band.description,
      color: band.color,
      from: Number.isFinite(band.above) ? band.above + 1 : 0,
      to: better ? better.above : 100,
    };
  });
}
