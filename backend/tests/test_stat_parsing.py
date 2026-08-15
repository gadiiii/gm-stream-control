"""Tests for parsing the nginx-rtmp /stat XML the poller reads every 5s."""

import main

IDLE = """<rtmp><server><application><name>live</name><live></live></application></server></rtmp>"""

PUBLISHING = """<rtmp><server><application><name>live</name><live>
  <stream>
    <name>gm</name>
    <time>125000</time>
    <bw_in>750000</bw_in>
    <client><id>1</id></client>
    <client><id>2</id></client>
  </stream>
</live></application></server></rtmp>"""

TWO_STREAMS = """<rtmp><server><application><name>live</name><live>
  <stream><name>a</name><time>5000</time><bw_in>1000</bw_in><client><id>1</id></client></stream>
  <stream><name>b</name><time>9000</time><bw_in>2000</bw_in>
    <client><id>2</id></client><client><id>3</id></client></stream>
</live></application></server></rtmp>"""


def test_idle_server_is_not_live():
    status = main.parse_nginx_rtmp_stat(IDLE)
    assert status.live is False
    assert status.total_viewers == 0


def test_publishing_stream_is_live():
    status = main.parse_nginx_rtmp_stat(PUBLISHING)
    assert status.live is True
    assert status.stream_name == "gm"
    assert status.total_viewers == 2


def test_uptime_is_converted_from_milliseconds():
    assert main.parse_nginx_rtmp_stat(PUBLISHING).uptime_secs == 125


def test_bitrate_is_bytes_per_second_as_kilobits():
    # 750000 B/s * 8 / 1000 = 6000 kbps
    assert main.parse_nginx_rtmp_stat(PUBLISHING).bitrate_kbps == 6000


def test_viewers_are_summed_across_streams_and_primary_is_the_busiest():
    status = main.parse_nginx_rtmp_stat(TWO_STREAMS)
    assert status.total_viewers == 3
    assert status.stream_name == "b"
