"""Tests for stream-key encryption and for keeping keys out of API responses."""

import main
import pytest
from fastapi import HTTPException


def test_encrypt_decrypt_round_trip():
    key = "abcd-1234-efgh-5678"
    assert main.decrypt_stream_key(main.encrypt_stream_key(key)) == key


def test_ciphertext_is_not_the_plaintext():
    key = "abcd-1234-efgh-5678"
    assert main.encrypt_stream_key(key) != key


def test_encrypting_the_same_key_twice_gives_different_ciphertext():
    """Fernet includes a timestamp and IV, so equal keys must not be linkable."""
    a = main.encrypt_stream_key("same-key")
    b = main.encrypt_stream_key("same-key")
    assert a != b
    assert main.decrypt_stream_key(a) == main.decrypt_stream_key(b) == "same-key"


def test_re_encrypting_ciphertext_is_rejected():
    """Guards fd403c3 — an edit form round-tripping the stored value back used
    to double-encrypt it, producing a key the platform silently rejects."""
    ciphertext = main.encrypt_stream_key("abcd-1234")
    with pytest.raises(HTTPException) as exc:
        main.encrypt_stream_key(ciphertext)
    assert exc.value.status_code == 422


def test_decrypting_garbage_raises_500_not_a_crash():
    with pytest.raises(HTTPException) as exc:
        main.decrypt_stream_key("definitely-not-fernet")
    assert exc.value.status_code == 500


def test_without_stream_key_strips_the_key_and_reports_presence():
    row = {"id": "1", "name": "YouTube", "stream_key": "gAAAAAsomething", "enabled": True}
    result = main.without_stream_key(row)

    assert "stream_key" not in result
    assert result["has_stream_key"] is True
    assert result["name"] == "YouTube"


def test_without_stream_key_reports_a_missing_key():
    result = main.without_stream_key({"id": "1", "name": "YouTube", "stream_key": None})
    assert result["has_stream_key"] is False


def test_without_stream_key_does_not_mutate_the_input():
    row = {"id": "1", "stream_key": "gAAAAAsomething"}
    main.without_stream_key(row)
    assert row["stream_key"] == "gAAAAAsomething"


def test_without_stream_key_handles_none():
    assert main.without_stream_key(None) == {}
