import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.attendance_service import haversine_distance, verify_clockin_eligibility

def test_haversine_distance():
    # Kuala Lumpur coordinates approx: (3.1390, 101.6869) and nearby point ~111m away
    dist = haversine_distance(3.139000, 101.686900, 3.140000, 101.686900)
    assert 100.0 < dist < 120.0

def test_verify_wifi_ip_pass():
    rules = {
        "enabled": True,
        "officeWifi": {
            "allowedIps": ["202.186.10.20"]
        }
    }
    # Matches Wi-Fi public IP
    res = verify_clockin_eligibility("202.186.10.20", None, rules)
    assert res["passed"] is True
    assert res["verify_method"] == "WIFI_IP"

def test_verify_stage1_fail_needs_gps():
    rules = {
        "enabled": True,
        "officeWifi": {
            "allowedIps": ["202.186.10.20"]
        }
    }
    # Different external IP, no coords
    res = verify_clockin_eligibility("115.164.50.1", None, rules)
    assert res["passed"] is False
    assert res["code"] == "NEED_GPS"

def test_verify_gps_within_100m_pass():
    rules = {
        "enabled": True,
        "maxDistanceMeters": 100,
        "maxDriftCompensation": 40,
        "officeLocations": [
            {
                "name": "KL HQ",
                "latitude": 3.139000,
                "longitude": 101.686900,
                "radiusMeters": 100
            }
        ],
        "officeWifi": { "allowedIps": ["202.186.10.20"] }
    }
    # User 50m away with 10m accuracy
    # 0.00045 degrees lat is ~50 meters
    res = verify_clockin_eligibility(
        "115.164.50.1",
        {"latitude": 3.139450, "longitude": 101.686900, "accuracy": 10.0},
        rules
    )
    assert res["passed"] is True
    assert res["verify_method"] == "GPS_GEOFENCE"
    assert res["effective_distance"] <= 100.0

def test_verify_gps_indoor_drift_compensation():
    rules = {
        "enabled": True,
        "maxDistanceMeters": 100,
        "maxDriftCompensation": 40,
        "officeLocations": [
            {
                "name": "KL HQ",
                "latitude": 3.139000,
                "longitude": 101.686900,
                "radiusMeters": 100
            }
        ]
    }
    # Suppose raw distance is 125 meters (0.00112 deg lat) with 35m accuracy (indoor high-rise)
    # Effective distance = 125 - 35 = 90 meters <= 100m (Should PASS!)
    res = verify_clockin_eligibility(
        "115.164.50.1",
        {"latitude": 3.140120, "longitude": 101.686900, "accuracy": 35.0},
        rules
    )
    assert res["passed"] is True
    assert res["effective_distance"] <= 100.0

def test_verify_gps_out_of_range_reject():
    rules = {
        "enabled": True,
        "maxDistanceMeters": 100,
        "maxDriftCompensation": 40,
        "officeLocations": [
            {
                "name": "KL HQ",
                "latitude": 3.139000,
                "longitude": 101.686900,
                "radiusMeters": 100
            }
        ]
    }
    # User 800m away (at home)
    res = verify_clockin_eligibility(
        "115.164.50.1",
        {"latitude": 3.146200, "longitude": 101.686900, "accuracy": 10.0},
        rules
    )
    assert res["passed"] is False
    assert res["code"] == "OUT_OF_RANGE"

def test_verify_coarse_accuracy_rejection():
    rules = {
        "enabled": True,
        "maxDistanceMeters": 100,
        "officeLocations": [
            {
                "name": "KL HQ",
                "latitude": 3.139000,
                "longitude": 101.686900,
                "radiusMeters": 100
            }
        ]
    }
    # Accuracy is 500m (cellular tower coarse location)
    res = verify_clockin_eligibility(
        "115.164.50.1",
        {"latitude": 3.139000, "longitude": 101.686900, "accuracy": 500.0},
        rules
    )
    assert res["passed"] is False
    assert res["code"] == "LOW_ACCURACY"

if __name__ == "__main__":
    test_haversine_distance()
    test_verify_wifi_ip_pass()
    test_verify_stage1_fail_needs_gps()
    test_verify_gps_within_100m_pass()
    test_verify_gps_indoor_drift_compensation()
    test_verify_gps_out_of_range_reject()
    test_verify_coarse_accuracy_rejection()
    print("All 7 Attendance Risk-Control & Geo Tests PASSED successfully!")

