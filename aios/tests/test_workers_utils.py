from workers.scrapers.utils import (
    is_defense,
    is_high_travel,
    is_non_ca_remote,
    matches_role,
)


def test_is_defense_blocks_military():
    assert is_defense("defense contractor") is True
    assert is_defense("military software") is True
    assert is_defense("normal startup") is False
    assert is_defense(None) is False


def test_is_high_travel_blocks_heavy():
    assert is_high_travel("role requires 60% travel") is True
    assert is_high_travel("frequent travel required") is True
    assert is_high_travel("occasional travel") is False
    assert is_high_travel(None) is False


def test_is_non_ca_remote_filters_non_ca():
    assert is_non_ca_remote("New York, NY") is True
    assert is_non_ca_remote("Chicago, IL") is True
    assert is_non_ca_remote("Remote") is False
    assert is_non_ca_remote("San Francisco, CA") is False
    assert is_non_ca_remote("California") is False
    assert is_non_ca_remote("London, UK") is True
    assert is_non_ca_remote(None) is False


def test_matches_role_forward_deployed():
    assert matches_role("Forward Deployed Engineer") is True
    assert matches_role("Solutions Engineer") is True
    assert matches_role("AI Automation Engineer") is True
    assert matches_role("Senior Software Engineer") is False
    assert matches_role("Backend Engineer") is False
    assert matches_role("ML Engineer") is False
    assert matches_role("Intern") is False


def test_matches_role_fde():
    assert matches_role("FDE") is True
    assert matches_role("founding engineer") is False
