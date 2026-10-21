/*
 * SCRIPTED DIALOGUE — the mock behind the SuspectService seam.
 * ------------------------------------------------------------------
 * Today the suspects answer from this hand-authored table, matched to
 * the player's question by keyword. When the fallible-memory backend is
 * built, `scriptedSuspectService` is swapped for one that asks the LLM;
 * this file is deleted and nothing else in the UI changes.
 *
 * Each line carries the `kind` (plain / lie / false-memory / evasion) so
 * the verdict screen can later reveal which "contradictions" were lies
 * and which were honest misremembering — the heart of the project.
 */

import type { StatementKind } from '../types';

export interface DialogueLine {
  /** Lower-case keywords; the player's question is matched against these. */
  triggers: string[];
  answer: string;
  kind: StatementKind;
  /** Optional clue this answer surfaces into the notebook. */
  revealsClue?: string;
  /**
   * A subtle "tell" the detective might notice. Shown as an italic
   * observation on easier difficulties (Rookie/Detective) and hidden on
   * Inspector — this is how the difficulty levels actually change play.
   */
  tell?: string;
  /** Higher wins when several lines match. */
  priority?: number;
}

export interface SuspectDialogue {
  greeting: string;
  suggestions: string[];
  lines: DialogueLine[];
  /** In-character deflection when nothing matches. */
  fallback: string;
}

export const DIALOGUE: Record<string, SuspectDialogue> = {
  /* ---------------------------------------------------------------- */
  agnes: {
    greeting:
      'Oh — Detective. Forgive me, my hands won’t stop shaking. Forty-one years ' +
      'in this house and never, never anything like this. Ask me whatever you must.',
    suggestions: [
      'Where were you tonight?',
      'When did you last see Lord Ravenswood?',
      'Did you hear anything unusual?',
    ],
    lines: [
      {
        triggers: ['where', 'were you', 'alibi', 'tonight', 'evening'],
        answer:
          'In my kitchen, sir, same as every night. I brewed his lordship’s tea at ' +
          'eleven and carried it up to the study myself, like I have done for years.',
        kind: 'false-memory',
        tell: 'She says it with total certainty — yet the kitchen teapot sits full and cold.',
        priority: 2,
      },
      {
        triggers: ['tea', 'teapot', 'kitchen', 'carry', 'serve'],
        answer:
          'The tea? Yes, I took it up to him. Earl Grey, two sugars, at eleven o’clock. ' +
          'He thanked me — he always thanks me. I remember it plain as day.',
        kind: 'false-memory',
        revealsClue: 'cold-teapot',
        tell: 'Plain as day — but the pot was never poured. Her nights blur into one.',
        priority: 3,
      },
      {
        triggers: ['last see', 'last saw', 'alive', 'when did you'],
        answer:
          'When I brought his tea, near eleven. He was at his desk with his brandy, ' +
          'quite alive, cross about the storm. That is the last I saw of the poor man.',
        kind: 'false-memory',
        tell: 'The timeline she describes cannot be true if the tea was never served.',
        priority: 2,
      },
      {
        triggers: ['hear', 'noise', 'sound', 'scream', 'unusual'],
        answer:
          'Only the storm, sir, thrashing at the windows. Perhaps a door — but this ' +
          'house groans like an old ship in weather. I thought nothing of it.',
        kind: 'plain',
      },
      {
        triggers: ['vivian', 'cross', 'guest', 'crimson', 'red dress'],
        answer:
          'Miss Cross? A fine lady. She keeps to herself. I did her turndown early and ' +
          'she said she had a headache. I did not see her after.',
        kind: 'plain',
      },
      {
        triggers: ['julian', 'nephew', 'heir'],
        answer:
          'Master Julian has a temper and empty pockets, but he loved his uncle in his ' +
          'way. He was shut in the library, I believe. I did not disturb him.',
        kind: 'plain',
      },
      {
        triggers: ['candlestick', 'weapon', 'brass'],
        answer:
          'The brass pair on the mantel? I polished them Tuesday. Are you saying one is ' +
          'gone? Heaven help us. No, I never touched them tonight.',
        kind: 'plain',
      },
    ],
    fallback:
      'I’m only a housekeeper, sir. I keep the fires lit and the linens clean. ' +
      'I couldn’t say about such things.',
  },

  /* ---------------------------------------------------------------- */
  julian: {
    greeting:
      'Detective. Let’s be quick — I’ve had a ghastly night and I’d rather not ' +
      'spend it being stared at like a specimen. What do you want?',
    suggestions: [
      'Where were you at eleven?',
      'What did you stand to gain?',
      "Were you in the cellar tonight?",
    ],
    lines: [
      {
        triggers: ['where', 'were you', 'alibi', 'eleven', '11', 'tonight'],
        answer:
          'The library. Reading. Alone. All evening. I’m sure the books will vouch for ' +
          'me if you ask them nicely.',
        kind: 'lie',
        tell: 'Too rehearsed, too fast. He blinks toward the cellar door when he says it.',
        priority: 2,
      },
      {
        triggers: ['cellar', 'wine', 'downstairs', 'basement'],
        answer:
          'The cellar? Why would I—  ...fine. I went down for a bottle. A man’s allowed ' +
          'a drink in his own family’s house. That is all. It has nothing to do with anything.',
        kind: 'evasion',
        revealsClue: 'gambling-papers',
        tell: 'He caves the instant the cellar is named. He is hiding something down there.',
        priority: 3,
      },
      {
        triggers: ['gain', 'inherit', 'money', 'will', 'estate', 'debt', 'gambling'],
        answer:
          'Yes, I inherit. Yes, I have debts. Say it plainly if you’re going to. But wanting ' +
          'money and swinging a candlestick are rather different crimes, aren’t they?',
        kind: 'plain',
      },
      {
        triggers: ['uncle', 'alistair', 'victim', 'relationship'],
        answer:
          'We argued about my "lifestyle." Constantly. But he was the only family I had ' +
          'left. I didn’t want him dead — I wanted him to sign a cheque.',
        kind: 'plain',
      },
      {
        triggers: ['see', 'saw', 'hear', 'anyone', 'notice'],
        answer:
          'I saw the inside of a book. I heard the storm. I keep to myself when the house is ' +
          'full of vultures — present company included.',
        kind: 'evasion',
        tell: 'He claims to have seen nothing, yet he was nowhere near the library.',
      },
      {
        triggers: ['vivian', 'cross', 'partner'],
        answer:
          'Vivian? My uncle’s business shadow. All silk and arithmetic. They were thick as ' +
          'thieves lately — then suddenly they weren’t. Ask her why.',
        kind: 'plain',
      },
    ],
    fallback:
      'I don’t see how that’s your concern. Move along, Detective — I’ve answered enough.',
  },

  /* ---------------------------------------------------------------- */
  vance: {
    greeting:
      'Detective. I’ll tell you exactly what I observed and nothing I did not. ' +
      'Precision matters more than ever tonight. Proceed.',
    suggestions: [
      'What was the time of death?',
      'How did he die?',
      'Where were you this evening?',
    ],
    lines: [
      {
        triggers: ['time of death', 'when did he die', 'what time', 'died'],
        answer:
          'By body temperature and the stopped watch, death occurred at roughly a quarter ' +
          'past eleven. I would stake my licence on the window between eleven and half past.',
        kind: 'plain',
        revealsClue: 'stopped-watch',
        priority: 2,
      },
      {
        triggers: ['how did he die', 'cause', 'wound', 'killed', 'method'],
        answer:
          'A single blow to the temple — something heavy and blunt. But note this: he was ' +
          'sedated first. There is a chalky residue in his glass. This was prepared, not sudden.',
        kind: 'plain',
        revealsClue: 'wine-residue',
        priority: 2,
      },
      {
        triggers: ['where', 'were you', 'alibi', 'evening'],
        answer:
          'In the conservatory with a medical journal from half past ten until the alarm was ' +
          'raised. The rain was loud; I heard no struggle. I wish I had.',
        kind: 'plain',
      },
      {
        triggers: ['sedative', 'poison', 'drug', 'residue', 'brandy', 'glass'],
        answer:
          'A sedative — a strong one — in the brandy. Enough to make a grown man pliant. ' +
          'Whoever did this wanted him unable to resist. That takes forethought.',
        kind: 'plain',
        revealsClue: 'wine-residue',
      },
      {
        triggers: ['candlestick', 'weapon', 'brass', 'blunt'],
        answer:
          'The wound is consistent with the brass candlestick from the mantel — the missing ' +
          'one. Match the weight to the injury and you have your weapon.',
        kind: 'plain',
        revealsClue: 'candlestick-missing',
      },
      {
        triggers: ['suspect', 'who', 'think', 'killer'],
        answer:
          'I do not speculate; I observe. But a planned sedation suggests someone with a ' +
          'clear head and a clear reason. Fear does not plan. Calculation does.',
        kind: 'plain',
      },
    ],
    fallback:
      'That is outside what I can state with certainty, Detective, so I will not state it.',
  },

  /* ---------------------------------------------------------------- */
  thomas: {
    greeting:
      'Y-yes, Detective? I’ll help however I can, honest. I only started here in the ' +
      'summer. Please — I can’t lose this position.',
    suggestions: [
      'Did you see anyone near the study?',
      'What were you doing at eleven?',
      'Was it Agnes you saw?',
    ],
    lines: [
      {
        triggers: ['see anyone', 'near the study', 'someone', 'figure', 'see'],
        answer:
          'I— I did see someone. On the landing by the study, near eleven. A woman, in a ' +
          'dark gown. I couldn’t see her face. I told myself it was nothing.',
        kind: 'plain',
        tell: 'He truly saw someone. Notice he did NOT say who — his memory is a blank he’ll let you fill.',
        priority: 2,
      },
      {
        triggers: ['agnes', 'housekeeper', 'was it agnes', 'grey', 'old woman'],
        answer:
          'Agnes? I— maybe? Now that you say it... she does wear grey, and it was dim. Yes, ' +
          'it could’ve been Agnes. I think it was. ...Was it? You’d know better than me, sir.',
        kind: 'false-memory',
        tell: 'DANGER: you suggested Agnes, and he adopted it instantly. This is planted, not remembered.',
        priority: 3,
      },
      {
        triggers: ['vivian', 'cross', 'crimson', 'red', 'was it vivian'],
        answer:
          'Miss Cross? She wears red, doesn’t she... I don’t know. When you say a name I ' +
          'start to see it, and then I can’t tell what I saw from what you said. I’m sorry.',
        kind: 'false-memory',
        tell: 'He does the same for any name you feed him. His eyewitness account is worthless unless he volunteers a detail himself.',
        priority: 3,
      },
      {
        triggers: ['where', 'were you', 'doing', 'eleven', 'alibi'],
        answer:
          'Turning down the hall lamps, upstairs, like I’m told to at eleven. That’s when ' +
          'I passed the landing. That’s when I saw... her. Whoever she was.',
        kind: 'plain',
      },
      {
        triggers: ['dress', 'gown', 'colour', 'color', 'wearing'],
        answer:
          'Dark. Long. That’s all I’m sure of, honest — dark and long. Everything else gets ' +
          'muddled the harder I chase it.',
        kind: 'plain',
        tell: '"Dark and long" is the only detail he owns. Trust that; distrust anything you name for him.',
      },
      {
        triggers: ['sure', 'certain', 'positive'],
        answer:
          'I want to be sure, I do. But the more I try to be sure, the more I doubt it. ' +
          'Is that— is that wrong of me?',
        kind: 'plain',
      },
    ],
    fallback:
      'I don’t know, sir. I’m sorry. I don’t want to say something that isn’t true.',
  },

  /* ---------------------------------------------------------------- */
  vivian: {
    greeting:
      'Detective — how thrilling, in a grim sort of way. Do sit. I’ll help however a ' +
      'grieving guest can, though I fear I slept through the whole tragedy.',
    suggestions: [
      'Where were you at eleven?',
      'What was your business with Alistair?',
      'Do you own a crimson gown?',
    ],
    lines: [
      {
        triggers: ['where', 'were you', 'alibi', 'eleven', '11', 'quarters', 'room'],
        answer:
          'In my quarters, darling, nursing a wretched headache. I retired before ten and ' +
          'saw no one until the screaming started. A dull alibi, I know — the true ones always are.',
        kind: 'lie',
        tell: 'Smooth, unhurried, complete. Yet mud from the conservatory says someone came in from the garden tonight.',
        priority: 2,
      },
      {
        triggers: ['business', 'money', 'ledger', 'company', 'partner', 'finance'],
        answer:
          'Alistair and I built something remarkable together. Numbers, contracts, the usual ' +
          'romance of commerce. If you’re asking whether we quarrelled about money — doesn’t everyone?',
        kind: 'evasion',
        revealsClue: 'burned-ledger',
        tell: 'She deflects the instant money is raised. And a ledger page lies half-burned in his grate.',
        priority: 3,
      },
      {
        triggers: ['crimson', 'red', 'gown', 'dress', 'thread', 'silk', 'wear'],
        answer:
          'A crimson gown? I own several — it’s my colour. But I was in my nightclothes by ' +
          'ten, Detective. Whatever thread you’ve found, half the wardrobes in this house are red.',
        kind: 'lie',
        revealsClue: 'crimson-thread',
        tell: 'She knew you had found a thread before you said so. How?',
        priority: 3,
      },
      {
        triggers: ['conservatory', 'garden', 'outside', 'mud', 'door', 'storm'],
        answer:
          'The conservatory? I adore it by day, but in a storm? No. I don’t go tramping ' +
          'through gardens at midnight, darling. Look at these shoes.',
        kind: 'lie',
        tell: 'A denial you never asked her to make. The muddy prints lead exactly from that door.',
      },
      {
        triggers: ['embezzle', 'steal', 'theft', 'expose', 'ruin', 'stole'],
        answer:
          'Embezzlement? What a word. Alistair was... imaginative about figures near the end. ' +
          'If he told you I stole from him, consider that dead men make convenient accusers.',
        kind: 'evasion',
        tell: 'Note how ready the denial is. She has rehearsed this exact defence.',
      },
      {
        triggers: ['alistair', 'victim', 'relationship', 'love', 'affair'],
        answer:
          'Fond of him? In the way one is fond of a business one has outgrown. He was becoming ' +
          '...difficult. But difficult men die of many things, Detective. Not only murder.',
        kind: 'evasion',
      },
    ],
    fallback:
      'What a curious little question. I’m afraid I haven’t the faintest idea, darling. ' +
      'Do try another.',
  },
};
