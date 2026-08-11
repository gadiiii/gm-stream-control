"""Tests for the nginx config generator."""

import main
import pytest


def destination(name: str, url: str, key: str = "abcd-1234-efgh-5678") -> dict:
    return {
        "id": f"id-{name}",
        "name": name,
        "rtmp_url": url,
        "stream_key": main.encrypt_stream_key(key),
        "enabled": True,
    }


def test_config_declares_no_resolver_directive():
    """`resolver` does not exist in Ubuntu's libnginx-mod-rtmp in any rtmp
    context — nginx refuses to start with it, taking down every destination.

    It was added in 4168d75 on the theory that it deferred push-hostname lookups
    to runtime, and removed again in d73ed66. Verified against the real module
    in test-env: nginx rejects it, and push hostnames are resolved when the
    config loads regardless. Keep it out."""
    config = main.build_nginx_config([])
    directives = [line.strip() for line in config.splitlines() if not line.strip().startswith("#")]
    assert not [d for d in directives if d.startswith("resolver")]


def test_one_push_line_per_destination():
    config = main.build_nginx_config(
        [
            destination("YouTube", "rtmp://a.rtmp.youtube.com/live2", "yt-key"),
            destination("Facebook", "rtmps://live-api-s.facebook.com:443/rtmp", "fb-key"),
        ]
    )
    pushes = [line.strip() for line in config.splitlines() if line.strip().startswith("push ")]
    assert pushes == [
        "push rtmp://a.rtmp.youtube.com/live2/yt-key;",
        "push rtmps://live-api-s.facebook.com:443/rtmp/fb-key;",
    ]


def test_push_target_keeps_exactly_one_slash_before_the_key():
    with_slash = main.build_nginx_config([destination("A", "rtmp://host/live2/", "k")])
    without_slash = main.build_nginx_config([destination("B", "rtmp://host/live2", "k")])
    assert "push rtmp://host/live2/k;" in with_slash
    assert "push rtmp://host/live2/k;" in without_slash


def test_no_push_lines_when_nothing_is_enabled():
    config = main.build_nginx_config([])
    assert not [line for line in config.splitlines() if line.strip().startswith("push ")]


def test_one_undecryptable_key_does_not_take_down_the_others():
    """A bad row used to raise out of the whole generator, blanking every push."""
    good = destination("YouTube", "rtmp://a.rtmp.youtube.com/live2", "yt-key")
    bad = {
        "id": "id-bad",
        "name": "Facebook",
        "rtmp_url": "rtmps://live-api-s.facebook.com:443/rtmp",
        "stream_key": "not-fernet-ciphertext",
        "enabled": True,
    }

    push_lines, skipped = main.build_push_lines([good, bad])

    assert push_lines == ["            push rtmp://a.rtmp.youtube.com/live2/yt-key;"]
    assert skipped == ["Facebook"]


def test_generated_config_has_balanced_braces():
    config = main.build_nginx_config([destination("YouTube", "rtmp://host/live2")])
    assert config.count("{") == config.count("}")


def test_hooks_and_stat_endpoint_are_present():
    config = main.build_nginx_config([])
    assert "on_publish http://127.0.0.1:8000/api/stream/on_publish;" in config
    assert "on_done http://127.0.0.1:8000/api/stream/on_done;" in config
    assert "rtmp_stat all;" in config


def test_load_module_is_first_line():
    """Ubuntu 24.04 needs the explicit load_module (f7a7aee), and nginx only
    accepts it at the top of the file."""
    config = main.build_nginx_config([])
    assert config.splitlines()[0] == "load_module modules/ngx_rtmp_module.so;"
