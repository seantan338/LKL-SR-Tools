import { NextResponse } from 'next/server';

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace('::ffff:', '');
  }
  return clean;
}

function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return normalizeIp(cfIp);

  const xForwarded = request.headers.get('x-forwarded-for');
  if (xForwarded && xForwarded.trim()) {
    const first = xForwarded.split(',')[0].trim();
    if (first) return normalizeIp(first);
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim()) return normalizeIp(xRealIp);

  return '127.0.0.1';
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const rEarth = 6371000.0; // Earth radius in meters
  const toRad = (x) => (x * Math.PI) / 180.0;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2.0) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2.0) ** 2);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));

  return Math.round(rEarth * c * 10) / 10;
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    let payload = {};
    try {
      payload = await request.json();
    } catch (e) {
      payload = {};
    }

    const rules = payload.rules || {
      enabled: true,
      maxDistanceMeters: 100,
      maxDriftCompensation: 40,
      officeLocations: [],
      officeWifi: { allowedIps: [] }
    };
    const coords = payload.coords;

    // Check if attendance rules are disabled
    if (rules.enabled === false) {
      return NextResponse.json({
        status: 'success',
        result: {
          passed: true,
          verify_method: 'RULE_DISABLED',
          message: '考勤规则未启用，直接放行 / Attendance rules disabled, check-in allowed',
          client_ip: clientIp
        }
      });
    }

    // -------------------------------------------------------------
    // Stage 1: Check Company Wi-Fi Public Egress IP
    // -------------------------------------------------------------
    const officeWifi = rules.officeWifi || {};
    const allowedIps = (officeWifi.allowedIps || []).map(ip => ip.trim()).filter(Boolean);
    const officeLocations = rules.officeLocations || (rules.officeLocation ? [rules.officeLocation] : []);
    const realAllowedIps = allowedIps.filter(ip => ip !== '127.0.0.1' && ip !== 'localhost' && ip !== '::1');

    // Local / Match check
    const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(clientIp);
    const ipMatched = allowedIps.includes(clientIp) || (isLocal && (realAllowedIps.length === 0 || allowedIps.includes('127.0.0.1')));

    if (ipMatched) {
      return NextResponse.json({
        status: 'success',
        result: {
          passed: true,
          verify_method: 'WIFI_IP',
          message: '打卡成功！已通过公司 Wi-Fi 认证 / Clocked in! Verified via Office Wi-Fi',
          client_ip: clientIp,
          hit_ip: clientIp
        }
      });
    }

    // If rules have no real enterprise Wi-Fi IP and no Office GPS set yet, default allow
    if (realAllowedIps.length === 0 && !officeWifi.ddnsDomain && officeLocations.length === 0) {
      return NextResponse.json({
        status: 'success',
        result: {
          passed: true,
          verify_method: 'WIFI_IP',
          message: '企业考勤网络白名单尚未设定，已默认放行 / Office Wi-Fi whitelist not configured, allowed by default',
          client_ip: clientIp,
          hit_ip: clientIp,
          unconfigured: true
        }
      });
    }

    // Wi-Fi not matched -> check if coords provided for Stage 2
    if (!coords || coords.latitude === undefined || coords.longitude === undefined || coords.latitude === null) {
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'NEED_GPS',
          message: `未检测到公司 Wi-Fi（当前 IP: ${clientIp}），请允许定位或联系管理员将该 IP 加入白名单 / Not on Office Wi-Fi (IP: ${clientIp}), allow GPS or ask admin to whitelist IP`,
          client_ip: clientIp
        }
      });
    }

    // -------------------------------------------------------------
    // Stage 2: 100-meter Elastic GPS Geofence Check
    // -------------------------------------------------------------
    const userLat = parseFloat(coords.latitude);
    const userLon = parseFloat(coords.longitude);
    const userAccuracy = parseFloat(coords.accuracy || 10.0);

    if (isNaN(userLat) || isNaN(userLon)) {
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'INVALID_COORDS',
          message: '经纬度数据格式异常，请重试 / Invalid GPS coordinates format, please retry',
          client_ip: clientIp
        }
      });
    }

    if (userAccuracy > 300.0) {
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'LOW_ACCURACY',
          message: `当前定位信号过弱（误差 ±${Math.round(userAccuracy)}米），请开启手机高精度 GPS 或连接公司 Wi-Fi / GPS signal too weak (±${Math.round(userAccuracy)}m), enable high-accuracy GPS or connect to Office Wi-Fi`,
          client_ip: clientIp,
          accuracy: userAccuracy
        }
      });
    }

    if (officeLocations.length === 0) {
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'NO_OFFICE_CONFIGURED',
          message: '企业尚未配置办公室坐标或 Wi-Fi 白名单，请联系管理员在后台完成考勤围栏设定 / Office coordinates not configured, please contact admin',
          client_ip: clientIp
        }
      });
    }

    const defaultMaxRadius = parseFloat(rules.maxDistanceMeters || 100.0);
    const maxDriftComp = parseFloat(rules.maxDriftCompensation || 40.0);

    let bestMatch = null;
    let minEffectiveDistance = Infinity;

    for (const office of officeLocations) {
      const oLat = parseFloat(office.latitude);
      const oLon = parseFloat(office.longitude);
      const oRadius = parseFloat(office.radiusMeters || defaultMaxRadius);
      const oName = office.name || '公司办公室';

      if (isNaN(oLat) || isNaN(oLon)) continue;

      const actualDist = haversineDistance(userLat, userLon, oLat, oLon);
      const comp = Math.min(userAccuracy, maxDriftComp);
      const effectiveDist = Math.max(0.0, actualDist - comp);

      if (effectiveDist < minEffectiveDistance) {
        minEffectiveDistance = effectiveDist;
        bestMatch = {
          office_name: oName,
          actual_distance: actualDist,
          effective_distance: effectiveDist,
          allowed_radius: oRadius,
          compensation: comp,
          accuracy: userAccuracy
        };
      }

      if (effectiveDist <= oRadius) {
        return NextResponse.json({
          status: 'success',
          result: {
            passed: true,
            verify_method: 'GPS_GEOFENCE',
            message: `打卡成功！已通过 ${oName} 考勤围栏核验（约 ${Math.round(effectiveDist)}m） / Clocked in! Verified at ${oName} (~${Math.round(effectiveDist)}m)`,
            client_ip: clientIp,
            office_name: oName,
            actual_distance: actualDist,
            effective_distance: effectiveDist,
            accuracy: userAccuracy,
            compensation: comp
          }
        });
      }
    }

    return NextResponse.json({
      status: 'rejected',
      result: {
        passed: false,
        code: 'OUT_OF_RANGE',
        message: `超出打卡范围：距离最近办公点约 ${Math.round(bestMatch?.effective_distance || minEffectiveDistance)}m（限 ${Math.round(defaultMaxRadius)}m 内） / Out of range: ~${Math.round(bestMatch?.effective_distance || minEffectiveDistance)}m from office (limit: ${Math.round(defaultMaxRadius)}m)`,
        client_ip: clientIp,
        details: bestMatch
      }
    });

  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: err.message || '考勤核验异常 / Attendance verification error'
    }, { status: 500 });
  }
}
