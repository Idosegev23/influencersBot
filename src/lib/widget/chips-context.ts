/**
 * Who the account is, in a few lines, for the widget chip generator.
 *
 * The chip model used to get only the display name plus `persona_summary`,
 * which no active account sets. With no products either, it guessed from the
 * name: "Elit Yagoda", a travel creator, got chips about שוקולד עלית.
 * Saying the account is a person, and in which niche, removes the guess.
 */
export function describeAccountForChips(config: any): string {
  const c = config || {};
  const lines: string[] = [];

  const isPerson = c.archetype === 'influencer';
  if (isPerson) {
    lines.push(
      'Account type: an influencer / content creator (a person, not a product brand). ' +
        'The name is a person\'s name; do not read it as a product or company.',
    );
  } else if (c.archetype) {
    lines.push(`Account type: ${c.archetype}`);
  }

  if (c.influencer_type) lines.push(`Niche: ${c.influencer_type}`);

  const description = c.persona_summary || c.widget?.welcomeMessage || c.chat_subtitle;
  if (description) lines.push(`Description: ${description}`);

  return lines.join('\n');
}
