import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRequest } from '../functions/api/concierge.ts';
import { formatChatTimestamp, formatChatTimestampTooltip } from '../lib/concierge/format.ts';

test('formatChatTimestamp formats timestamp into Stockholm 24h format', () => {
  // 2026-09-13T20:15:00Z is 22:15 in Europe/Stockholm (UTC+2 CEST)
  const epochMs = new Date('2026-09-13T20:15:00Z').getTime();
  assert.equal(formatChatTimestamp(epochMs, 'sv'), '22:15');
  assert.equal(formatChatTimestamp(epochMs, 'en'), '22:15');

  // Also handles ISO string
  assert.equal(formatChatTimestamp('2026-09-13T20:15:00Z', 'sv'), '22:15');

  // Returns null for missing/falsy timestamp
  assert.equal(formatChatTimestamp(undefined), null);
  assert.equal(formatChatTimestamp(0), null);

  // Returns string directly if not a parseable date
  assert.equal(formatChatTimestamp('custom-time'), 'custom-time');
});

test('formatChatTimestampTooltip formats localized tooltip date string in Stockholm time', () => {
  const epochMs = new Date('2026-09-13T20:15:30Z').getTime();
  const tooltip = formatChatTimestampTooltip(epochMs, 'sv');
  assert.ok(tooltip);
  assert.ok(tooltip.includes('22:15:30'));

  assert.equal(formatChatTimestampTooltip(undefined), undefined);
});

test('validateRequest accepts and preserves message timestamps in concierge API', () => {
  const timestamp = 1726262400000;
  const valid = validateRequest({
    query: 'fika',
    language: 'sv',
    messages: [
      { role: 'user', content: 'Kafé i Vasastan', timestamp },
      { role: 'assistant', content: 'Pascal', timestamp: timestamp + 2000 },
    ],
  });

  assert.equal(valid.query, 'fika');
  assert.deepEqual(valid.context.messages, [
    { role: 'user', content: 'Kafé i Vasastan', timestamp },
    { role: 'assistant', content: 'Pascal', timestamp: timestamp + 2000 },
  ]);

  // Accepts messages without timestamps as well (backward compatible)
  const withoutTs = validateRequest({
    query: 'fika',
    messages: [
      { role: 'user', content: 'Kafé i Vasastan' },
    ],
  });
  assert.deepEqual(withoutTs.context.messages, [
    { role: 'user', content: 'Kafé i Vasastan' },
  ]);

  // Rejects messages with invalid timestamp types
  assert.throws(() => validateRequest({
    query: 'fika',
    messages: [{ role: 'user', content: 'test', timestamp: { invalid: true } }],
  }), /invalid_messages/);

  assert.throws(() => validateRequest({
    query: 'fika',
    messages: [{ role: 'user', content: 'test', timestamp: true }],
  }), /invalid_messages/);
});

test('styles.css defines timestamp and bubble header styling for concierge conversation history', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.concierge-chat-timestamp'), 'styles.css should define .concierge-chat-timestamp');
  assert.ok(css.includes('.concierge-chat-bubble-header'), 'styles.css should define .concierge-chat-bubble-header');
  assert.ok(css.includes('.concierge-chat-bubble.user'), 'styles.css should define .concierge-chat-bubble.user');
  assert.ok(css.includes('.concierge-chat-bubble.assistant'), 'styles.css should define .concierge-chat-bubble.assistant');
  assert.ok(css.includes('.concierge-chat-bubble-content'), 'styles.css should define .concierge-chat-bubble-content');
});
