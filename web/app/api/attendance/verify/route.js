import { NextResponse } from 'next/server';

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace('::ffff:', '');
  }
  return clean;
}

function expandIpv6(ip) {
  if (!ip || !ip.includes(':')) return null;
  const clean = ip.split('/')[0].trim().toLowerCase();
  const parts = clean.split('::');
  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;
  const middle = Array(missing).fill('0');
  return [...left, ...middle, ...right].map(p => p.padStart(4, '0'));
}

function matchIpv6Prefix(ip1, ip2, blocks = 4) {
  const exp1 = expandIpv6(ip1);
  const exp2 = expandIpv6(ip2);
  if (!exp1 || !exp2) return false;
  for (let i = 0; i < blocks; i++) {
    if (exp1[i] !== exp2[i]) return false;
  }
  return true;
}

function ipv4ToInt(ip) {
  if (!ip || typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

function matchIpv4Cidr(clientIp, cidr) {
  if (!cidr || !clientIp) return false;
  const cleanCidr = cidr.trim();
  if (!cleanCidr.includes('/')) return clientIp.trim() === cleanCidr;
  const [subnet, bitsStr] = cleanCidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const clientInt = ipv4ToInt(clientIp);
  const subnetInt = ipv4ToInt(subnet.trim());
  if (clientInt === null || subnetInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (clientInt & mask) === (subnetInt & mask);
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

    const workMode = payload.workMode || 'OFFICE';
    const wfhNote = (payload.wfhNote || '').trim();

    const rules = payload.rules || {
      enabled: true,
      allowWfh: true,
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
    // Stage 0: Special Check-in for WFH (Work From Home)
    // -------------------------------------------------------------
    if (workMode === 'WFH') {
      if (rules.allowWfh === false) {
        return NextResponse.json({
          status: 'rejected',
          result: {
            passed: false,
            code: 'WFH_DISABLED',
            message: 'Work From Home (WFH) check-in is currently disabled by administrator / 管理员已关闭居家办公 (WFH) 打卡权限',
            client_ip: clientIp
          }
        });
      }
      return NextResponse.json({
        status: 'success',
        result: {
          passed: true,
          verify_method: 'WFH',
          message: 'WFH Check-in Successful! / 居家办公 (WFH) 打卡成功！',
          client_ip: clientIp,
          wfh_note: wfhNote
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
    let ipMatched = allowedIps.includes(clientIp) || (isLocal && (realAllowedIps.length === 0 || allowedIps.includes('127.0.0.1')));
    if (!ipMatched && clientIp.includes(':')) {
      for (const allowed of allowedIps) {
        if (allowed.includes(':') && matchIpv6Prefix(clientIp, allowed, 4)) {
          ipMatched = true;
          break;
        }
      }
    }
    if (!ipMatched && !clientIp.includes(':')) {
      for (const allowed of allowedIps) {
        if (allowed.includes('/') && !allowed.includes(':') && matchIpv4Cidr(clientIp, allowed)) {
          ipMatched = true;
          break;
        }
      }
    }

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
      const ua = request.headers.get('user-agent') || '';
      const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
      const appleHelp = isApple
        ? '【苹果手机排查】若已连公司 Wi-Fi，请在 iPhone「设置 -> Wi-Fi -> (i)」关闭「限制 IP 地址跟踪」或关闭「iCloud 专用代理」，避免公网 IP 被苹果中继代理拦截！'
        : '';
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'NEED_GPS',
          message: `未检测到公司 Wi-Fi（当前识别 IP: ${clientIp}），请允许定位打卡${isApple ? '，或参考下方苹果 Wi-Fi 提示' : ''}`,
          apple_help: appleHelp,
          client_ip: clientIp,
          is_ipv6: clientIp.includes(':')
        }
      });
    }

    // -------------------------------------------------------------
    // Stage 2: Elastic GPS Geofence Check
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
      let oLat = parseFloat(office.latitude);
      let oLon = parseFloat(office.longitude);
      if (Math.abs(oLat - 3.139) < 0.001 && Math.abs(oLon - 101.6869) < 0.001) {
        oLat = 1.440472;
        oLon = 103.617917;
      }
      const oRadius = parseFloat(rules.maxDistanceMeters || office.radiusMeters || defaultMaxRadius);
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

      if (effectiveDist <= oRadius || actualDist <= oRadius) {
        return NextResponse.json({
          status: 'success',
          result: {
            passed: true,
            verify_method: 'GPS_GEOFENCE',
            message: `Clocked in! Verified at ${oName} (~${Math.round(effectiveDist)}m, GPS ±${Math.round(userAccuracy)}m) / 打卡成功！已通过 ${oName} 考勤围栏核验（约 ${Math.round(effectiveDist)}m）`,
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

    if (userAccuracy > 500.0) {
      return NextResponse.json({
        status: 'rejected',
        result: {
          passed: false,
          code: 'LOW_ACCURACY',
          message: `GPS signal too weak (±${Math.round(userAccuracy)}m, measured ~${Math.round(bestMatch?.actual_distance || 0)}m from office). Enable high-accuracy GPS or connect to Office Wi-Fi / 定位误差过大（±${Math.round(userAccuracy)}米，实测距公司约 ${Math.round(bestMatch?.actual_distance || 0)}米），请开启手机高精度 GPS 或连接公司 Wi-Fi`,
          client_ip: clientIp,
          accuracy: userAccuracy,
          details: bestMatch
        }
      });
    }

    const limitRadius = Math.round(bestMatch?.allowed_radius || defaultMaxRadius);
    const effDistRound = Math.round(bestMatch?.effective_distance ?? minEffectiveDistance);
    const actDistRound = Math.round(bestMatch?.actual_distance ?? minEffectiveDistance);

    return NextResponse.json({
      status: 'rejected',
      result: {
        passed: false,
        code: 'OUT_OF_RANGE',
        message: `Out of range: ~${effDistRound}m from office (raw: ${actDistRound}m, GPS ±${Math.round(userAccuracy)}m, limit: ${limitRadius}m) / 超出打卡范围：距办公点约 ${effDistRound}m（原始: ${actDistRound}m, 限 ${limitRadius}m 内）`,
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
