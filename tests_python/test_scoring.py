from motkarta.scoring import (
    EngagementSignals,
    EvidenceSignals,
    PlaceInput,
    SpecialtyAttributes,
    bayesian_rate,
    bayesian_rating,
    recency_weight,
    score_place,
    verify_specialty_coffee_eligibility,
)


def test_bayesian_rating_tempers_tiny_samples():
    assert bayesian_rating(5, 3, 4.1, 30) < bayesian_rating(4.6, 300, 4.1, 30)


def test_recency_weight_half_life():
    assert round(recency_weight(180, 180), 2) == 0.5


def test_exposure_adjusted_rate_rewards_efficiency():
    assert bayesian_rate(50, 200, 0.08, 50) > bayesian_rate(800, 20_000, 0.08, 50)


def test_score_place_returns_promised_dimensions():
    place = PlaceInput(
        id=1,
        name="Roaster",
        kind="Specialty coffee",
        area="Södermalm",
        tags=["Filter", "Independent"],
        rating_average=4.7,
        reliable_rating_count=80,
        review_count=100,
        category_mean_rating=4.2,
        mainstream_exposure=25,
        days_since_fresh_evidence=20,
        evidence=EvidenceSignals(
            specialist_guide=1,
            independent_editorial=1,
            verified_attributes=90,
            data_freshness=90,
            confidence="High",
        ),
        engagement=EngagementSignals(
            search_impressions=300,
            map_marker_clicks=70,
            saves=45,
            direction_requests=20,
            confirmed_visits=15,
            repeat_visits=5,
            recent_saves=14,
        ),
        specialty=SpecialtyAttributes(
            specialty_verified=True,
            traceable_coffee=True,
            filter_coffee=True,
            espresso_based=True,
            single_origin=True,
            manual_brew_methods=["V60"],
            verification_sources=2,
        ),
    )

    scores = score_place(place)
    assert set(scores) == {"quality", "popularity", "relevance", "discovery", "freshness", "recommendation"}
    assert scores["quality"] > 0


def test_specialty_coffee_verification_gates():
    fake_place = PlaceInput(
        id=2,
        name="Fake Premium Cafe",
        kind="Specialty coffee",
        area="Vasastan",
        tags=["Coffee"],
        evidence=EvidenceSignals(specialist_guide=0),
        specialty=SpecialtyAttributes(specialty_verified=False, verification_sources=0),
    )
    assert not verify_specialty_coffee_eligibility(fake_place)

    verified_place = PlaceInput(
        id=3,
        name="Real Roaster",
        kind="Specialty coffee",
        area="Vasastan",
        tags=["Coffee"],
        evidence=EvidenceSignals(specialist_guide=1),
    )
    assert verify_specialty_coffee_eligibility(verified_place)
