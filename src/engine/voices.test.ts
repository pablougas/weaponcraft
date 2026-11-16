import { describe, expect, it } from 'vitest';
import { GOD_VOICES, lineSeconds, pickVoice, spokenLine } from './voices';
import { DESCENT_CAPTIONS } from '../view/cinematics/descent';
import { FREED_BEATS } from '../sim/cutscenes/freed';
import { FREED_CAPTIONS } from '../view/cinematics/freed';
import { TICK_HZ } from '../sim/constants';

describe('the gods\' voices', () => {
  it('voices god lines only, without stage directions or key hints', () => {
    expect(spokenLine('Hades: Brother. Olympus has fallen.')).toMatchObject({ speaker: 'Hades', words: 'Brother. Olympus has fallen.' });
    expect(spokenLine('[The Warden falls] Hades: The chains, brother. Free him.')).toMatchObject({ speaker: 'Hades', words: 'The chains, brother. Free him.' });
    expect(spokenLine('Hades: I will walk with you, brother. (V to switch)')!.words).toBe('I will walk with you, brother.');
    expect(spokenLine('Poseidon: Some are.')!.voice.id).toBe('poseidon');
    expect(spokenLine('Zeus: They will answer for this.')!.voice.id).toBe('zeus');
    // Not gods, or not speech.
    expect(spokenLine('The Warden: You broke my hound.')).toBeNull();
    expect(spokenLine('[Soldier] “Who’s there?”')).toBeNull();
    expect(spokenLine('Find and free Cerberus.')).toBeNull();
    expect(spokenLine('Zeus has fallen. He wakes at the Refuge.')).toBeNull();
  });

  it('each god sounds different: Hades deepest and slowest', () => {
    const { Zeus, Hades, Poseidon } = GOD_VOICES;
    expect(Hades.pitch).toBeLessThan(Poseidon.pitch);
    expect(Poseidon.pitch).toBeLessThan(Zeus.pitch);
    expect(Hades.rate).toBeLessThan(Zeus.rate);
    expect(Hades.root).toBeLessThan(Zeus.root);
  });

  it('only on-device voices are used (no network speech)', () => {
    const v = (name: string, localService: boolean, lang = 'en-US') => ({ name, localService, lang, default: false, voiceURI: name }) as SpeechSynthesisVoice;
    const voices = [v('Google UK English Male', false, 'en-GB'), v('Samantha', true), v('Daniel', true, 'en-GB'), v('Thomas', true, 'fr-FR')];
    expect(pickVoice(voices, GOD_VOICES.Zeus)!.name).toBe('Daniel');
    expect(pickVoice([v('Google UK English Male', false)], GOD_VOICES.Hades)).toBeUndefined();
    expect(pickVoice([v('Samantha', true)], GOD_VOICES.Hades)!.name).toBe('Samantha');
  });

  it('the freed scene leaves time for each god line to be spoken before the next', () => {
    const order = ['lineHades', 'linePoseidon1', 'lineZeus', 'linePoseidon2'] as const;
    const beats = [...order.map((b) => FREED_BEATS[b]), FREED_BEATS.end];
    order.forEach((beat, i) => {
      const line = spokenLine(FREED_CAPTIONS[beat])!;
      const gap = (beats[i + 1] - beats[i]) / TICK_HZ;
      expect(lineSeconds(line.words, line.voice.rate)).toBeLessThan(gap);
    });
    // The descent's lines are short enough already.
    expect(spokenLine(DESCENT_CAPTIONS.lineHades1)).not.toBeNull();
  });
});
