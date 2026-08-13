from motkarta.scoring import (
    EngagementSignals,
    EvidenceSignals,
    PlaceInput,
    SpecialtyAttributes,
    bayesian_rate,
    bayesian_rating,
    logarithmic_count_score,
    popularity_score,
    recency_weight,
    score_place,
    verify_specialty_coffee_eligibility,
)


def test_bayesian_rating_tempers_tiny_samples():
    assert bayesian_rating(5, 3, 4.1, 30) < bayesian_rating(4.6, 300, 4.1, 30)


def test_bayesian_rating_prevents_winner_take_all():
    central_cafe = bayesian_rating(4.2, 8000, 4.1, 30)  # ~4.199
    local_bakery = bayesian_rating(4.8, 45, 4.1, 30)    # ~4.520
    new_specialty = bayesian_rating(4.9, 12, 4.1, 30)   # ~4.328

    assert local_bakery > new_specialty > central_cafe


def test_recency_weight_half_life():
    assert round(recency_weight(0, 180), 2) == 1.0
    assert round(recency_weight(180, 180), 2) == 0.5
    assert round(recency_weight(360, 180), 2) == 0.25


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
    verified_place = PlaceInput(
        id=3,
        name="Real Roaster",
        kind="Specialty coffee",
        area="Vasastan",
        tags=["Coffee"],
        evidence=EvidenceSignals(specialist_guide=1),
    )
    assert verify_specialty_coffee_eligibility(verified_place)


def test_popularity_score_components_and_logarithmic_transform():
    log_100 = logarithmic_count_score(100, 10000)
    log_10000 = logarithmic_count_score(10000, 10000)
    assert 0 < log_100 < log_10000 == 100

    place = PlaceInput(
        id=10,
        name="Popular Bakery",
        kind="Bakery",
        area="Södermalm",
        tags=["Bread"],
        rating_average=4.7,
        reliable_rating_count=120,
        evidence=EvidenceSignals(specialist_guide=1, independent_editorial=1, verified_user_rating=90, credible_reviewers=85),
        engagement=EngagementSignals(
            search_impressions=500,
            saves=100,
            direction_requests=40,
            confirmed_visits=30,
            repeat_visits=15,
            recent_saves=35,
        ),
    )
    res = popularity_score(place)
    assert "score" in res
    assert "bayesian_user_rating" in res
    assert "exposure_adjusted_engagement" in res
    assert "repeat_visit_rate" in res
    assert "recent_save_rate" in res
    assert "source_consensus" in res
    assert res["score"] > 0
