import { describe, expect, it } from 'vitest';
import { isGlueStopPhrase, tokenizeNormalizedText, tokenizeOracle } from './oracle-diction';
import { flattenOracleText, markStructuralElements, parseOracleText } from './oracle-parser';
import { coverOracleCard } from './oracle-tagger-coverage';

const BYWATER =
  'Destroy all creatures with power 3 or greater. Then create a Food token for each creature you control. (It\'s an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")';
const SAM =
  'Whenever another nontoken creature you control enters, create a Food token. (It\'s an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")\nSacrifice three Foods: Return target historic card from your graveyard to your hand. (Artifacts, legendaries, and Sagas are historic.)';
const FARMER =
  'When this creature enters, create a Food token. When you do, target creature you control gets +1/+1 until end of turn for each Food you control. (A Food token is an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")';
const TROLL =
  "This creature can't be blocked except by three or more creatures.\nSwampcycling {1} ({1}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)";
const SACRIFICE_PRODUCER = '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.';

describe('oracle-parser', () => {
  it('marks trigger and condition prefixes without keeping them in flattened subjects', () => {
    const text = 'Whenever you draw a card, draw a card.';
    const marks = markStructuralElements(text);
    expect(marks.some((mark) => mark.type === 'trigger' && mark.prefix === 'whenever')).toBe(true);

    const flat = flattenOracleText(text);
    expect(flat.triggers).toEqual(['you draw a card']);
    expect(flat.triggers.some((entry) => /whenever/i.test(entry))).toBe(false);
  });

  it('extracts condition subjects and leaf effects separately', () => {
    const text = 'If you control a Wizard, draw two cards.';
    const flat = flattenOracleText(text);
    expect(flat.conditions).toEqual(['you control a Wizard']);
    expect(flat.effects.some((entry) => entry.includes('draw two cards'))).toBe(true);
  });

  it('leaves reflexive clause prefixes out of ngram fields', () => {
    const text = 'Whenever a creature dies, you may draw a card. When you do, create a Treasure token.';
    const flat = flattenOracleText(text);
    expect(flat.triggers.some((entry) => entry.includes('you do'))).toBe(false);
    expect(flat.effects.some((entry) => entry.includes('create a Treasure token'))).toBe(true);
  });

  it('keeps a condition nested inside an activated ability', () => {
    const flat = flattenOracleText(SACRIFICE_PRODUCER);
    expect(flat.conditions).toEqual(['the sacrificed creature was legendary']);
    expect(flat.effects.some((entry) => /amass orcs 2/i.test(entry))).toBe(true);
  });

  it('parses activated ability effect text after the colon', () => {
    const text = '{T}: Draw a card.';
    const parsed = parseOracleText(text);
    const flat = flattenOracleText(text);
    expect(parsed.length).toBeGreaterThan(0);
    expect(flat.effects.some((entry) => entry.toLowerCase().includes('draw a card'))).toBe(true);
    expect(flat.costs.some((entry) => entry.includes('{T}'))).toBe(true);
  });

  it('emits sacrifice text before the colon as cost, not as a dropped span', () => {
    const flat = flattenOracleText(SACRIFICE_PRODUCER);
    expect(flat.costs.some((entry) => /sacrifice another creature/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /loses 1 life/i.test(entry))).toBe(true);
  });

  it('tags Bywater as opaque effect leaves, not a wipe frame', () => {
    const flat = flattenOracleText(BYWATER);
    expect(flat.triggers).toEqual([]);
    expect(flat.conditions).toEqual([]);
    expect(flat.effects.some((entry) => /destroy all creatures with power 3 or greater/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /create a food token/i.test(entry))).toBe(true);
  });

  it('tags Sam\'s sacrifice line as cost plus opaque effect', () => {
    const flat = flattenOracleText(SAM);
    expect(flat.triggers.some((entry) => /another nontoken creature/i.test(entry))).toBe(true);
    expect(flat.costs.some((entry) => /sacrifice three foods/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /return target historic card/i.test(entry))).toBe(true);
  });

  it('signposts Farmer this and keeps the get-leaf opaque', () => {
    const flat = flattenOracleText(FARMER);
    expect(flat.pointers).toContain('this creature');
    expect(flat.triggers.some((entry) => /this creature enters/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /\+1\/\+1/.test(entry))).toBe(true);
  });

  it('tags a keyword line as keyword, not as an effect VP', () => {
    const text = 'Flying\nWhen this creature enters, amass Orcs 2.';
    const flat = flattenOracleText(text, ['Flying', 'Amass']);
    expect(flat.keywords.some((entry) => /flying/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /^flying$/i.test(entry.trim()))).toBe(false);
    expect(flat.effects.some((entry) => /amass orcs 2/i.test(entry))).toBe(true);
  });

  it('tags Troll this on an opaque effect and drops swampcycling reminder as a named hole', () => {
    const flat = flattenOracleText(TROLL);
    expect(flat.pointers).toContain('this creature');
    expect(flat.effects.some((entry) => /can\'t be blocked/i.test(entry))).toBe(true);
    const covered = coverOracleCard({ name: 'Troll of Khazad-dûm', oracleText: TROLL });
    expect(covered.holes).toContain('keyword_reminder');
  });

  it('marks until end of turn as glue while the effect leaf stays tagged', () => {
    const text = 'Target creature gets +1/+1 until end of turn.';
    const flat = flattenOracleText(text);
    expect(flat.effects.some((entry) => /gets \+1\/\+1/i.test(entry))).toBe(true);
    expect(tokenizeNormalizedText(text)).toContain('until_end_of_turn');
    expect(isGlueStopPhrase('until end of turn')).toBe(true);
  });

  it('folds draw-a and draw-2 onto NUM without reading the effect VP', () => {
    expect(tokenizeOracle('Draw a card.')).toContain('<NUM>');
    expect(tokenizeOracle('Draw 2 cards.')).toContain('<NUM>');
  });

  it('covers gold print once costs and reminders are classified', () => {
    const bywater = coverOracleCard({ name: 'The Battle of Bywater', oracleText: BYWATER });
    const sam = coverOracleCard({ name: 'Samwise Gamgee', oracleText: SAM });
    const farmer = coverOracleCard({ name: 'Eastfarthing Farmer', oracleText: FARMER });
    expect(bywater.unexplained).toBe(false);
    expect(sam.unexplained).toBe(false);
    expect(farmer.holes).toContain('keyword_reminder');
  });

  it('records choose-one as a hole even when modes flatten cleanly', () => {
    const covered = coverOracleCard({
      name: 'modal leftover',
      oracleText: 'Choose one —\n• Draw a card.\n• Exile target creature.'
    });
    expect(covered.holes).toContain('choose_one');
    expect(covered.unexplained).toBe(false);
  });

  it('unpacks Gorbag choose-one into effect leaves, not one modal blob', () => {
    const text =
      'Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one —\n• Draw a card.\n• Create a Treasure token.';
    const flat = flattenOracleText(text);
    expect(flat.triggers.some((entry) => /goblin or orc/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /sacrifice it/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /draw a card/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /create a treasure token/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /choose one/i.test(entry))).toBe(false);
    expect(coverOracleCard({ name: 'Gorbag of Minas Morgul', oracleText: text }).drawers).toEqual([]);
  });

  it('keeps Flame of Anor bullets as effects and the wizard line as a condition', () => {
    const text =
      'Choose one. If you control a Wizard as you cast this spell, you may choose two instead.\n• Target player draws two cards.\n• Destroy target artifact.\n• Flame of Anor deals 5 damage to target creature.';
    const flat = flattenOracleText(text);
    expect(flat.conditions).toEqual(['you control a Wizard as you cast this spell']);
    expect(flat.effects).toEqual(
      expect.arrayContaining([
        'Target player draws two cards.',
        'Destroy target artifact.',
        'Flame of Anor deals 5 damage to target creature.'
      ])
    );
    expect(flat.effects.some((entry) => /^choose one/i.test(entry.trim()))).toBe(false);
  });

  it('tags Stone of Erech sacrifice-before-colon as cost', () => {
    const text =
      "If a creature an opponent controls would die, exile it instead.\n{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card.";
    const flat = flattenOracleText(text);
    expect(flat.conditions.some((entry) => /would die/i.test(entry))).toBe(true);
    expect(flat.costs).toEqual(expect.arrayContaining(['{2}', '{T}', 'Sacrifice Stone of Erech']));
    expect(flat.effects.some((entry) => /exile it/i.test(entry))).toBe(true);
  });

  it('tags Equip as keyword plus cost, not an opaque effect', () => {
    const text =
      "During your turn, equipped creature has hexproof and can't be blocked.\nWhenever equipped creature attacks alone, you draw a card and you lose 1 life.\nEquip Halfling {1}\nEquip {4}";
    const flat = flattenOracleText(text, ['Equip']);
    expect(flat.triggers.some((entry) => /attacks alone/i.test(entry))).toBe(true);
    expect(flat.costs).toEqual(expect.arrayContaining(['{1}', '{4}']));
    expect(flat.keywords.some((entry) => /^equip/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /^equip\b/i.test(entry.trim()))).toBe(false);
  });

  it('compounds a same-clause trigger with choose-one modes', () => {
    const text =
      'Whenever Bill Ferny becomes blocked, choose one —\n• Create a Treasure token.\n• Target opponent gains control of target Horse you control. If they do, remove Bill Ferny from combat and create three Treasure tokens.';
    const flat = flattenOracleText(text);
    expect(flat.triggers.some((entry) => /becomes blocked/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /create a treasure token/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /gains control of target horse/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(flat.effects.some((entry) => /choose one/i.test(entry))).toBe(false);
    expect(coverOracleCard({ name: 'Bill Ferny, Bree Swindler', oracleText: text }).drawers).toEqual([]);
  });

  it('treats choose two and choose 3 as the same choose-NUM gold, not choose-a', () => {
    const two = flattenOracleText('Choose two —\n• Draw a card.\n• Discard a card.');
    const three = flattenOracleText('Choose 3 —\n• Exile target artifact.');
    const creature = flattenOracleText('Choose a creature you control. It gets +1/+1 until end of turn.');
    expect(two.effects.some((entry) => /draw a card/i.test(entry))).toBe(true);
    expect(two.effects.some((entry) => /choose two/i.test(entry))).toBe(false);
    expect(three.effects.some((entry) => /exile target artifact/i.test(entry))).toBe(true);
    expect(creature.effects.some((entry) => /choose a creature/i.test(entry))).toBe(true);
  });

  it('keeps choose-one-that-has-not-been-chosen as header glue on the same gold', () => {
    const text =
      "Whenever you cast an instant or sorcery spell, choose one that hasn't been chosen —\n• You may tap or untap target permanent.\n• Gandalf deals 3 damage to each opponent.\n• Copy target instant or sorcery spell you control. You may choose new targets for the copy.\n• Put Gandalf on top of its owner's library.";
    const covered = coverOracleCard({ name: 'Gandalf the Grey', oracleText: text });
    expect(covered.flat.triggers.some((entry) => /instant or sorcery/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(covered.drawers).toEqual([]);
    expect(covered.remainder).not.toMatch(/hasn/);
  });

  it('emits the instead VP instead of dropping it after the first effect', () => {
    const text =
      'Whenever equipped creature attacks, create two tapped 1/1 white Spirit creature tokens with flying. If that creature is legendary, instead create two of those tokens that are tapped and attacking.';
    const flat = flattenOracleText(text);
    expect(flat.conditions.some((entry) => /legendary/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /tapped and attacking/i.test(entry))).toBe(true);
  });

  it('keeps mana after the colon on the effect, extra life on the cost', () => {
    const flat = flattenOracleText('{T}, Pay 1 life: Add {B} or {R}.');
    expect(flat.costs.some((entry) => /pay 1 life/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /add \{b\} or \{r\}/i.test(entry))).toBe(true);
    expect(flat.costs.filter((entry) => entry === '{B}' || entry === '{R}')).toEqual([]);
  });

  it('tags ward {2} as a costed keyword, not an effect VP', () => {
    const flat = flattenOracleText('Deathtouch, ward {2}', ['Deathtouch', 'Ward']);
    expect(flat.keywords.some((entry) => /ward/i.test(entry))).toBe(true);
    expect(flat.costs).toContain('{2}');
    expect(flat.effects.some((entry) => /^ward/i.test(entry.trim()))).toBe(false);
  });

  it('does not treat Equip abilities as an Equip cost line', () => {
    const flat = flattenOracleText('Equip abilities you activate cost {1} less to activate.');
    expect(flat.keywords.some((entry) => /^equip/i.test(entry))).toBe(false);
    expect(flat.effects.some((entry) => /cost \{1\} less/i.test(entry))).toBe(true);
  });

  it('keeps a choose-NUM header VP as an extra effect, not a new channel', () => {
    const text =
      'Whenever you scry, choose one and Glorfindel gets +1/+1 until end of turn.\n• Glorfindel must be blocked this turn if able.\n• Glorfindel can\'t be blocked by more than one creature each combat this turn.';
    const flat = flattenOracleText(text);
    expect(flat.effects.some((entry) => /\+1\/\+1/i.test(entry))).toBe(true);
    expect(flat.conditions.some((entry) => /^able$/i.test(entry.trim()))).toBe(false);
  });

  it('lifts a quoted trigger out of granted text instead of punting the quote', () => {
    const text =
      'Enchant creature\nEnchanted creature gets -3/-0 and has "At the beginning of your upkeep, exile this creature unless you pay 2 life."';
    const flat = flattenOracleText(text, ['Enchant']);
    expect(flat.triggers.some((entry) => /your upkeep/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /exile this creature/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /at the beginning/i.test(entry))).toBe(false);
  });

  it('parses a quoted activated ability even when the quote has no period', () => {
    const text =
      'Whenever a creature dies, create a token that\'s a copy of that creature, except it\'s a Food artifact with "{2}, {T}, Sacrifice this token: You gain 3 life," and it loses all other card types.';
    const flat = flattenOracleText(text);
    expect(flat.costs).toEqual(expect.arrayContaining(['{2}', '{T}', 'Sacrifice this token']));
    expect(flat.effects.some((entry) => /gain 3 life/i.test(entry))).toBe(true);
  });

  it('keeps a later activated body that is only a quoted trigger', () => {
    const text =
      '{W}: If this creature is a Citizen, it becomes a Scout.\n{B}{B}{B}: If this creature is a Scout, it becomes a Rogue with "Whenever this creature deals combat damage to a player, that player loses the game if the Ring has tempted you four or more times this game. Otherwise, the Ring tempts you."';
    const flat = flattenOracleText(text);
    expect(flat.conditions.some((entry) => /scout/i.test(entry))).toBe(true);
    expect(flat.triggers.some((entry) => /combat damage/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /loses the game/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /tempts you/i.test(entry))).toBe(true);
  });

  it('treats a later choose-NUM instead as the same modal, not a second channel', () => {
    const text =
      'Choose one. If you control a Wizard as you cast this spell, you may choose two instead.\n• Draw two cards.\n• Destroy target artifact.';
    const covered = coverOracleCard({ name: 'modal upgrade', oracleText: text });
    expect(covered.flat.conditions.some((entry) => /wizard/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /draw two cards/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /choose two/i.test(entry))).toBe(false);
    expect(covered.drawers).toEqual([]);
  });

  it('splits paired trailing ifs so the second VP is not swallowed', () => {
    const text =
      'Whenever you attack, put it onto the battlefield. It gains trample if you control a Dwarf and hexproof if you control an Elf.';
    const flat = flattenOracleText(text);
    expect(flat.conditions).toEqual(
      expect.arrayContaining([expect.stringMatching(/dwarf/i), expect.stringMatching(/elf/i)])
    );
    expect(flat.conditions.some((entry) => /dwarf.*hexproof/i.test(entry))).toBe(false);
    expect(flat.effects.some((entry) => /trample/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /hexproof/i.test(entry))).toBe(true);
  });

  it('flattens two spell faces without reading //, and layout names adventure vs DFC', () => {
    const creature =
      "Whenever Bonecrusher Giant becomes the target of a spell, it deals 2 damage to that spell's controller.";
    const instant = 'Stomp deals 2 damage to each creature.';
    const joined = `${creature}\n${instant}`;
    const adventure = coverOracleCard({
      name: 'Bonecrusher Giant // Stomp',
      oracleText: joined,
      faces: [creature, instant],
      layout: 'adventure'
    });
    const dfc = coverOracleCard({
      name: 'Front // Back',
      oracleText: joined,
      faces: [creature, instant],
      layout: 'modal_dfc'
    });
    expect(adventure.holes).toContain('adventure_layout');
    expect(dfc.holes).toContain('dfc_layout');
    expect(adventure.holes).not.toContain('dfc_layout');
    expect(dfc.holes).not.toContain('adventure_layout');
    expect(adventure.flat.triggers.some((entry) => /target of a spell/i.test(entry))).toBe(true);
    expect(adventure.flat.effects.some((entry) => /deals 2 damage to each creature/i.test(entry))).toBe(true);
    expect(adventure.remainder).not.toMatch(/\/\//);
    expect(adventure.unexplained).toBe(false);
    expect(dfc.unexplained).toBe(false);
  });

  it('keeps the default VP when a choose mode has a later instead', () => {
    const text =
      'Choose one —\n• Target creature gets -5/-5 until end of turn. If that creature would die this turn, exile it instead.\n• Destroy target artifact.';
    const flat = flattenOracleText(text);
    expect(flat.effects.some((entry) => /-5\/-5/.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /exile it/i.test(entry))).toBe(true);
    expect(flat.conditions.some((entry) => /would die/i.test(entry))).toBe(true);
  });

  it('treats choose one or both as the same modal gold', () => {
    const text = 'Choose one or both —\n• Draw a card.\n• Destroy target artifact.';
    const covered = coverOracleCard({ name: 'one or both', oracleText: text });
    expect(covered.holes).toContain('choose_one');
    expect(covered.flat.effects.some((entry) => /^or both$/i.test(entry.trim()))).toBe(false);
    expect(covered.unexplained).toBe(false);
  });

  it('treats a line-start name em-dash as an ability label, then parses the rest', () => {
    const text =
      'Blow Up — {T}, Sacrifice this creature: It deals damage equal to its power to target creature. Activate only as a sorcery.';
    const flat = flattenOracleText(text, ['Blow Up']);
    expect(flat.keywords.some((entry) => /blow up/i.test(entry))).toBe(true);
    expect(flat.costs).toEqual(expect.arrayContaining(['{T}', 'Sacrifice this creature']));
    expect(flat.effects.some((entry) => /deals damage equal to its power/i.test(entry))).toBe(true);
  });

  it('peels named extra-cost modes so bullets are not an opaque choice leaf', () => {
    const text =
      'Tiered (Choose one additional cost.)\n• Fire — {0} — This spell deals 1 damage to each creature.\n• Fira — {2} — This spell deals 2 damage to each creature.';
    const covered = coverOracleCard({
      name: 'named extra cost',
      oracleText: text,
      keywords: ['Tiered', 'Fire', 'Fira']
    });
    expect(covered.flat.costs).toEqual(expect.arrayContaining(['{0}', '{2}']));
    expect(covered.flat.effects.some((entry) => /deals 1 damage/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(covered.drawers).toEqual([]);
  });

  it('does not steal a keyword name out of a labeled ability VP', () => {
    const text =
      'Survival — At the beginning of your second main phase, if this creature is tapped, put a flying, lifelink, or +1/+1 counter on it.';
    const flat = flattenOracleText(text, ['Survival']);
    expect(flat.keywords.some((entry) => /survival/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /lifelink/i.test(entry) && /flying/i.test(entry))).toBe(true);
  });

  it('keeps the default VP when instead shares the same sentence', () => {
    const text =
      'When you unlock this door, you may cast spells from your graveyard this turn, and if a card would be put into your graveyard from anywhere this turn, exile it instead.';
    const covered = coverOracleCard({ name: 'same-sentence instead', oracleText: text });
    expect(covered.flat.effects.some((entry) => /cast spells from your graveyard/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /exile it/i.test(entry))).toBe(true);
    expect(covered.unexplained).toBe(false);
  });

  it('keeps the default search when a later if-instead replaces it', () => {
    const text =
      'Search your library for a Demon card, reveal it, put it into your hand, then shuffle.\nDelirium — If there are four or more card types among cards in your graveyard, instead search your library for any card, put it into your hand, then shuffle.';
    const covered = coverOracleCard({ name: 'delirium instead', oracleText: text, keywords: ['Delirium'] });
    expect(covered.flat.effects.some((entry) => /demon card/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /any card/i.test(entry))).toBe(true);
    expect(covered.unexplained).toBe(false);
  });

  it('keeps instead-of destination framing on the same VP, not a sentence replacement', () => {
    const text =
      "Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.";
    const covered = coverOracleCard({ name: 'counter exile', oracleText: text });
    expect(covered.flat.effects.some((entry) => /exile it/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /of putting/i.test(entry))).toBe(false);
    expect(covered.remainder).not.toMatch(/putting/);
    expect(covered.unexplained).toBe(false);
  });

  it('parses an activated body that forks with otherwise after the colon', () => {
    const text =
      '{2}{B}: If this creature is suspected, put a +1/+1 counter on it. Otherwise, suspect it.';
    const flat = flattenOracleText(text);
    expect(flat.costs).toEqual(expect.arrayContaining(['{2}', '{B}']));
    expect(flat.conditions.some((entry) => /suspected/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /\+1\/\+1/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /suspect it/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /^\{2\}\{B\}:$/.test(entry.trim()))).toBe(false);
  });

  it('keeps a trailing choose bullet that ends in a quote inside the modal', () => {
    const text =
      'Whenever you cast an instant or sorcery spell, choose one —\n• That spell gains deathtouch and lifelink.\n• Create a 2/2 red Imp creature token with "When this token dies, it deals 2 damage to each opponent."';
    const covered = coverOracleCard({ name: 'quoted mode', oracleText: text });
    expect(covered.flat.effects.some((entry) => /deathtouch and lifelink/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /create a 2\/2/i.test(entry))).toBe(true);
    expect(covered.flat.triggers.some((entry) => /this token dies/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(covered.drawers).toEqual([]);
  });

  it('tags a costed keyword ability line without leaving the keyword name as remainder', () => {
    const text =
      'Waterbend {3}: This creature has base power and toughness 5/2 until end of turn.';
    const covered = coverOracleCard({
      name: 'waterbend ability',
      oracleText: text,
      keywords: ['Waterbend']
    });
    expect(covered.flat.keywords.some((entry) => /waterbend/i.test(entry))).toBe(true);
    expect(covered.flat.costs).toEqual(expect.arrayContaining(['{3}']));
    expect(covered.flat.effects.some((entry) => /5\/2/i.test(entry))).toBe(true);
    expect(covered.remainder).not.toMatch(/waterbend/);
    expect(covered.unexplained).toBe(false);
  });

  it('treats choose up to X the same as choose-NUM gold', () => {
    const text =
      'When this creature enters, choose up to X, where X is the number of Lesson cards in your graveyard —\n• Draw a card.\n• Exile target creature.';
    const covered = coverOracleCard({ name: 'choose up to x', oracleText: text });
    expect(covered.holes).toContain('choose_one');
    expect(covered.flat.effects.some((entry) => /draw a card/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(covered.drawers).toEqual([]);
    expect(covered.unexplained).toBe(false);
  });

  it('recognizes colorless {C} as mana cost, not leftover text', () => {
    const flat = flattenOracleText('{C}{W}: Draw a card.');
    expect(flat.costs).toEqual(expect.arrayContaining(['{C}', '{W}']));
    expect(flat.effects.some((entry) => /draw a card/i.test(entry))).toBe(true);
  });

  it('peels a costed keyword ability after an ability-word label', () => {
    const text =
      'Exhaust — Waterbend {3}: This Vehicle becomes an artifact creature. Put three +1/+1 counters on it.';
    const covered = coverOracleCard({
      name: 'exhaust waterbend',
      oracleText: text,
      keywords: ['Exhaust', 'Waterbend']
    });
    expect(covered.flat.keywords.some((entry) => /exhaust/i.test(entry))).toBe(true);
    expect(covered.flat.keywords.some((entry) => /waterbend/i.test(entry))).toBe(true);
    expect(covered.flat.costs).toEqual(expect.arrayContaining(['{3}']));
    expect(covered.remainder).not.toMatch(/waterbend/);
    expect(covered.unexplained).toBe(false);
  });

  it('keeps a shared sentence between choose-NUM and its bullets inside the modal', () => {
    const text =
      'Choose up to two. Return those cards from your graveyard to your hand.\n• Target artifact card.\n• Target creature card.';
    const covered = coverOracleCard({ name: 'choose shared effect', oracleText: text });
    expect(covered.flat.effects.some((entry) => /return those cards/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => /target artifact card/i.test(entry))).toBe(true);
    expect(covered.flat.effects.some((entry) => entry.includes('•'))).toBe(false);
    expect(covered.drawers).toEqual([]);
  });

  it('keeps an activated create-X leaf when a granted quote follows the only period', () => {
    const text =
      '{T}: Create X 1/1 colorless Pilot creature tokens, where X is the number of Mounts and/or Vehicles that entered the battlefield under your control this turn. The tokens have "This token saddles Mounts and crews Vehicles as though its power were 2 greater."';
    const flat = flattenOracleText(text);
    expect(flat.costs).toEqual(expect.arrayContaining(['{T}']));
    expect(flat.effects.some((entry) => /create x 1\/1/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /saddles mounts/i.test(entry))).toBe(true);
  });

  it('peels Start your engines! from printed keywords despite the bang', () => {
    const text =
      'Start your engines! (If you have no speed, it starts at 1.)\nMax speed — {T}: Draw a card.';
    const flat = flattenOracleText(text, ['Start your engines!', 'Max speed']);
    expect(flat.keywords.some((entry) => /start your engines/i.test(entry))).toBe(true);
    expect(flat.keywords.some((entry) => /max speed/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /start your engines/i.test(entry))).toBe(false);
    expect(flat.effects.some((entry) => /draw a card/i.test(entry))).toBe(true);
  });

  it('keeps trailing adverbial instead on the redirected VP, not an empty replacement leaf', () => {
    const text =
      "Gandalf's Sanction deals X damage to target creature, where X is the number of instant and sorcery cards in your graveyard. Excess damage is dealt to that creature's controller instead.";
    const flat = flattenOracleText(text);
    expect(flat.effects.some((entry) => /deals x damage/i.test(entry) && /where x is/i.test(entry))).toBe(
      true
    );
    expect(flat.effects.some((entry) => /excess damage/i.test(entry))).toBe(true);
    expect(flat.effects.some((entry) => /^instead\.?$/i.test(entry.trim()))).toBe(false);
    expect(flat.pointers).toEqual(expect.arrayContaining(['that creature']));
  });
});
