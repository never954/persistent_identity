/*
 * OPENING LINES — what each suspect says as you sit down, and three suggested
 * first questions. Everything after the greeting is answered live by the suspect
 * backend (backend/: a persistent, fallible memory per suspect plus an LLM voice),
 * so there are no scripted answers here any more.
 *
 * Interviews take place the morning after the murder (the backend's clock starts
 * at 9 a.m.), so these lines speak of "last night".
 */

export interface SuspectDialogue {
  greeting: string;
  suggestions: string[];
}

export const DIALOGUE: Record<string, SuspectDialogue> = {
  agnes: {
    greeting:
      'Oh — Detective. Forgive me, my hands won’t stop shaking. Forty-one years in this house ' +
      'and never, never anything like this. Ask me whatever you must.',
    suggestions: [
      'Where were you last night?',
      'When did you last see Lord Ravenswood?',
      'Did you hear anything unusual?',
    ],
  },
  julian: {
    greeting:
      'Detective. Let’s be quick — I’ve had a ghastly night and I’d rather not spend the morning ' +
      'being stared at like a specimen. What do you want?',
    suggestions: [
      'Where were you at eleven?',
      'What did you stand to gain?',
      'Were you in the cellar last night?',
    ],
  },
  vance: {
    greeting:
      'Detective. I’ll tell you exactly what I observed and nothing I did not. Precision matters ' +
      'more than ever this morning. Proceed.',
    suggestions: [
      'What was the time of death?',
      'How did he die?',
      'Where were you last evening?',
    ],
  },
  thomas: {
    greeting:
      'Y-yes, Detective? I’ll help however I can, honest. I only started here in the summer. ' +
      'Please — I can’t lose this position.',
    suggestions: [
      'Did you see anyone near the study?',
      'What were you doing at eleven?',
      'Was it Agnes you saw?',
    ],
  },
  vivian: {
    greeting:
      'Detective — how thrilling, in a grim sort of way. Do sit. I’ll help however a grieving ' +
      'guest can, though I fear I slept through the whole tragedy.',
    suggestions: [
      'Where were you at eleven?',
      'What was your business with Alistair?',
      'Do you own a crimson gown?',
    ],
  },
};
