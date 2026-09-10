import test from 'node:test';
import assert from 'node:assert/strict';
import { reciprocalRankFusion } from '../lib/concierge/hybrid_search.ts';

function mockCandidate(id, overrides = {}) {
  return {
    place: {
      id,
      name: `Place ${id}`,
      kind: 'Café',
      area: 'Södermalm',
      scores: {
        quality: 80,
        popularity: 50,
        relevance: 70,
        discovery: 60,
        freshness: 90,
        recommendation: overrides.recommendationScore ?? 75,
      },
      tags: [],
      is_hidden_gem: false,
      ...overrides.place,
    },
    facts: { id, facts: [], document: '', chainStatus: 'independent' },
    exact: Boolean(overrides.exact),
    lexicalScore: overrides.lexicalScore ?? 0.5,
    lexicalRank: overrides.lexicalRank,
    vectorRank: overrides.vectorRank,
    vectorScore: overrides.vectorScore,
    fusionScore: 0,
    ...overrides,
  };
}

test('reciprocalRankFusion prioritizes exact matches ahead of high fusion scores', () => {
  const lexical = [
    mockCandidate(1, { lexicalRank: 1, recommendationScore: 90 }),
    mockCandidate(2, { exact: true, lexicalRank: 2, recommendationScore: 60 }),
  ];
  const semantic = [
    mockCandidate(1, { vectorRank: 1 }),
  ];

  const fused = reciprocalRankFusion(lexical, semantic);
  assert.equal(fused[0].place.id, 2, 'Exact match must rank first');
  assert.equal(fused[0].fusionRank, 1);
  assert.equal(fused[1].place.id, 1);
  assert.equal(fused[1].fusionRank, 2);
});

test('reciprocalRankFusion reinforces candidates present in both lexical and semantic sets', () => {
  const c1 = mockCandidate(10, { lexicalRank: 1 }); // only lexical
  const c2 = mockCandidate(20, { lexicalRank: 2 }); // both
  const c3 = mockCandidate(30); // only semantic

  const lexical = [c1, c2];
  const semantic = [
    mockCandidate(20, { vectorRank: 1, vectorScore: 0.88 }),
    mockCandidate(30, { vectorRank: 2, vectorScore: 0.82 }),
  ];

  const fused = reciprocalRankFusion(lexical, semantic, { k: 60 });
  // c2 fusionScore = 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ~= 0.016129 + 0.016393 = 0.03252
  // c1 fusionScore = 1/(60+1) = 0.01639
  // c3 fusionScore = 1/(60+2) = 0.01612
  assert.equal(fused[0].place.id, 20);
  assert.equal(fused[0].vectorScore, 0.88);
  assert.ok(fused[0].fusionScore > fused[1].fusionScore);
  assert.equal(fused[1].place.id, 10);
  assert.equal(fused[2].place.id, 30);
});

test('reciprocalRankFusion breaks ties with recommendation score and ID', () => {
  const lexical = [
    mockCandidate(101, { lexicalRank: 5, recommendationScore: 80 }),
    mockCandidate(102, { lexicalRank: 5, recommendationScore: 90 }),
  ];
  const semantic = [];

  const fused = reciprocalRankFusion(lexical, semantic);
  assert.equal(fused[0].place.id, 102, 'Higher recommendation score breaks tie');
  assert.equal(fused[1].place.id, 101);
});
