import math
import time
import socket
from typing import Optional, Dict, Any, List
from fastapi import Request

try:
    from logger import logger
except ImportError:
    from ..logger import logger

# In-memory cache for DDNS resolution: { domain: (ip, expiry_timestamp) }
_DDNS_CACHE: Dict[str, tuple[str, float]] = {}
DDNS_CACHE_TTL = 60.0  # 60 seconds

def get_client_ip(request: Request) -> str:
    """
    Extracts real client egress public IP from trusted reverse proxy headers.
    Priority: CF-Connecting-IP -> X-Forwarded-For -> X-Real-IP -> request.client.host
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded and x_forwarded.strip():
        # X-Forwarded-For can be a comma-separated list: "client, proxy1, proxy2"
        first_ip = x_forwarded.split(",")[0].strip()
        if first_ip:
            return first_ip

    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip and x_real_ip.strip():
        return x_real_ip.strip()

    if request.client and request.client.host:
        return request.client.host.strip()

    return "127.0.0.1"


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two GPS points in meters using Haversine formula.
    """
    r_earth = 6371000.0  # Earth's radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return round(r_earth * c, 1)


def resolve_ddns_domain(domain: str) -> Optional[str]:
    """
    Resolves DDNS domain to current public IP with 60-second in-memory caching.
    """
    if not domain or not domain.strip():
        return None

    clean_domain = domain.strip().lower()
    now = time.time()

    if clean_domain in _DDNS_CACHE:
        cached_ip, expiry = _DDNS_CACHE[clean_domain]
        if now < expiry:
            return cached_ip

    try:
        resolved_ip = socket.gethostbyname(clean_domain)
        _DDNS_CACHE[clean_domain] = (resolved_ip, now + DDNS_CACHE_TTL)
        return resolved_ip
    except Exception as e:
        logger.warning(f"Failed to resolve DDNS domain '{clean_domain}': {e}")
        return None


def verify_clockin_eligibility(
    client_ip: str,
    coords: Optional[Dict[str, Any]],
    rules: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Executes the two-stage progressive verification funnel:
    Stage 1: Company Wi-Fi Public Egress IP / DDNS match.
    Stage 2: 100-meter Elastic GPS Geofence with indoor drift compensation.
    """
    # If attendance rules are disabled, allow by default
    if not rules.get("enabled", True):
        return {
            "passed": True,
            "verify_method": "RULE_DISABLED",
            "message": "考勤规则未启用，直接放行 / Attendance rules disabled, check-in allowed",
            "client_ip": client_ip,
        }

    # -------------------------------------------------------------
    # Stage 1: Check Company Wi-Fi Public Egress IP
    # -------------------------------------------------------------
    office_wifi = rules.get("officeWifi") or {}
    allowed_ips = [ip.strip() for ip in office_wifi.get("allowedIps", []) if ip.strip()]

    # Also resolve DDNS if configured
    ddns_domain = office_wifi.get("ddnsDomain", "")
    if ddns_domain:
        resolved_ip = resolve_ddns_domain(ddns_domain)
        if resolved_ip and resolved_ip not in allowed_ips:
            allowed_ips.append(resolved_ip)

    # In local development environments, treat localhost / private IPs as matching if configured or matching
    if client_ip in allowed_ips or (client_ip in ("127.0.0.1", "localhost", "::1") and ("127.0.0.1" in allowed_ips or not allowed_ips)):
        return {
            "passed": True,
            "verify_method": "WIFI_IP",
            "message": "打卡成功！已通过公司 Wi-Fi 认证 / Clocked in! Verified via Office Wi-Fi",
            "client_ip": client_ip,
            "hit_ip": client_ip,
        }

    # If Stage 1 did not pass and no GPS coordinates were provided, ask frontend to enter Stage 2
    if not coords or coords.get("latitude") is None or coords.get("longitude") is None:
        return {
            "passed": False,
            "code": "NEED_GPS",
            "message": "未检测到公司 Wi-Fi，请允许获取位置信息以验证 100 米考勤范围 / Not on Office Wi-Fi, please allow location access to verify 100m geofence",
            "client_ip": client_ip,
        }

    # -------------------------------------------------------------
    # Stage 2: 100-meter Elastic GPS Geofence Check
    # -------------------------------------------------------------
    try:
        user_lat = float(coords["latitude"])
        user_lon = float(coords["longitude"])
        user_accuracy = float(coords.get("accuracy", 10.0))
    except (ValueError, TypeError):
        return {
            "passed": False,
            "code": "INVALID_COORDS",
            "message": "经纬度数据格式异常，请重试 / Invalid GPS coordinates format, please retry",
            "client_ip": client_ip,
        }

    # Intercept coarse base-station positioning (> 300 meters error)
    if user_accuracy > 300.0:
        return {
            "passed": False,
            "code": "LOW_ACCURACY",
            "message": f"当前定位信号过弱（定位误差达 ±{int(user_accuracy)}米），请开启手机精准 GPS 或连接公司 Wi-Fi / GPS signal too weak (±{int(user_accuracy)}m), enable high-accuracy GPS or connect to Office Wi-Fi",
            "client_ip": client_ip,
            "accuracy": user_accuracy,
        }

    office_locations = rules.get("officeLocations") or []
    # Backward compatibility with single officeLocation object
    if not office_locations and rules.get("officeLocation"):
        office_locations = [rules["officeLocation"]]

    # If no office location is configured yet
    if not office_locations:
        return {
            "passed": False,
            "code": "NO_OFFICE_CONFIGURED",
            "message": "企业尚未配置办公室地理坐标，请联系管理员在后台完成考勤围栏设定 / Office coordinates not configured, please contact admin",
            "client_ip": client_ip,
        }

    default_max_radius = float(rules.get("maxDistanceMeters", 100.0))
    max_drift_comp = float(rules.get("maxDriftCompensation", 40.0))

    best_match = None
    min_effective_distance = float("inf")

    # Evaluate all configured office locations (supports multi-office)
    for office in office_locations:
        try:
            o_lat = float(office.get("latitude", 0))
            o_lon = float(office.get("longitude", 0))
            o_radius = float(office.get("radiusMeters") or default_max_radius)
            o_name = office.get("name") or "公司办公室"
        except (ValueError, TypeError):
            continue

        actual_dist = haversine_distance(user_lat, user_lon, o_lat, o_lon)

        # Indoor drift compensation: effective_dist = max(0, actual_dist - min(accuracy, max_drift_comp))
        comp = min(user_accuracy, max_drift_comp)
        effective_dist = max(0.0, actual_dist - comp)

        if effective_dist < min_effective_distance:
            min_effective_distance = effective_dist
            best_match = {
                "office_name": o_name,
                "actual_distance": actual_dist,
                "effective_distance": effective_dist,
                "allowed_radius": o_radius,
                "compensation": comp,
                "accuracy": user_accuracy,
            }

        if effective_dist <= o_radius:
            return {
                "passed": True,
                "verify_method": "GPS_GEOFENCE",
                "message": f"打卡成功！已通过 {o_name} 考勤围栏核验（约 {int(effective_dist)}m） / Clocked in! Verified at {o_name} (~{int(effective_dist)}m)",
                "client_ip": client_ip,
                "office_name": o_name,
                "actual_distance": actual_dist,
                "effective_distance": effective_dist,
                "accuracy": user_accuracy,
                "compensation": comp,
            }

    # Out of Range
    return {
        "passed": False,
        "code": "OUT_OF_RANGE",
        "message": f"超出打卡范围：距离最近办公点约 {int(best_match['effective_distance'] if best_match else min_effective_distance)}m（限 {int(default_max_radius)}m 内） / Out of range: ~{int(best_match['effective_distance'] if best_match else min_effective_distance)}m from office (limit: {int(default_max_radius)}m)",
        "client_ip": client_ip,
        "details": best_match,
    }
