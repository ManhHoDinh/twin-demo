/* FloodTwin address lookup: reverse geocoding plus post-merger Da Nang names. */
(function () {
  "use strict";

  const FT = window.FT = window.FT || {};
  const cache = new Map();

  const ADMIN_UNITS = [
    ["Phường Hải Châu", ["Hải Châu", "Thanh Bình", "Thuận Phước", "Thạch Thang", "Phước Ninh"]],
    ["Phường Hòa Cường", ["Hòa Cường", "Bình Thuận", "Hòa Thuận Tây", "Hòa Cường Bắc", "Hòa Cường Nam"]],
    ["Phường Thanh Khê", ["Thanh Khê", "Xuân Hà", "Chính Gián", "Thạc Gián", "Thanh Khê Tây", "Thanh Khê Đông"]],
    ["Phường An Khê", ["An Khê", "Hòa An", "Hòa Phát"]],
    ["Phường An Hải", ["An Hải", "Phước Mỹ", "An Hải Bắc", "An Hải Nam"]],
    ["Phường Sơn Trà", ["Sơn Trà", "Thọ Quang", "Nại Hiên Đông", "Mân Thái"]],
    ["Phường Ngũ Hành Sơn", ["Ngũ Hành Sơn", "Mỹ An", "Khuê Mỹ", "Hòa Hải", "Hòa Quý"]],
    ["Phường Hòa Khánh", ["Hòa Khánh", "Hòa Khánh Nam", "Hòa Minh", "Hòa Sơn"]],
    ["Phường Hải Vân", ["Hải Vân", "Hòa Hiệp Bắc", "Hòa Hiệp Nam", "Hòa Bắc"]],
    ["Phường Liên Chiểu", ["Liên Chiểu", "Hòa Khánh Bắc"]],
    ["Phường Cẩm Lệ", ["Cẩm Lệ", "Hòa Thọ Tây", "Hòa Thọ Đông", "Khuê Trung"]],
    ["Phường Hòa Xuân", ["Hòa Xuân", "Hòa Châu", "Hòa Phước"]],
    ["Phường Điện Bàn", ["Điện Bàn", "Điện Phương", "Điện Minh", "Vĩnh Điện"]],
    ["Phường Điện Bàn Đông", ["Điện Bàn Đông", "Điện Nam Đông", "Điện Nam Trung", "Điện Dương", "Điện Ngọc", "Điện Nam Bắc"]],
    ["Phường An Thắng", ["An Thắng", "Điện An", "Điện Thắng Nam", "Điện Thắng Trung"]],
    ["Phường Điện Bàn Bắc", ["Điện Bàn Bắc", "Điện Thắng Bắc", "Điện Hòa", "Điện Tiến"]],
    ["Phường Hội An", ["Hội An", "Minh An", "Cẩm Phô", "Sơn Phong", "Cẩm Nam", "Cẩm Kim"]],
    ["Phường Hội An Đông", ["Hội An Đông", "Cẩm Châu", "Cửa Đại", "Cẩm Thanh"]],
    ["Phường Hội An Tây", ["Hội An Tây", "Thanh Hà", "Tân An", "Cẩm An", "Cẩm Hà"]],
    ["Xã Hòa Vang", ["Hòa Vang", "Hòa Phong", "Hòa Phú"]],
    ["Xã Hòa Tiến", ["Hòa Tiến", "Hòa Khương"]],
    ["Xã Bà Nà", ["Bà Nà", "Hòa Ninh", "Hòa Nhơn"]],
    ["Xã Nam Phước", ["Nam Phước", "Duy Phước", "Duy Vinh"]],
    ["Xã Duy Xuyên", ["Duy Xuyên", "Duy Trung", "Duy Sơn", "Duy Trinh"]],
    ["Xã Thu Bồn", ["Thu Bồn", "Duy Châu", "Duy Hòa", "Duy Hoà", "Duy Phú", "Duy Tân"]],
    ["Xã Duy Nghĩa", ["Duy Nghĩa", "Duy Thành", "Duy Hải"]],
    ["Xã Điện Bàn Tây", ["Điện Bàn Tây", "Điện Hồng", "Điện Thọ", "Điện Phước"]],
    ["Xã Gò Nổi", ["Gò Nổi", "Điện Phong", "Điện Trung", "Điện Quang"]],
    ["Xã Đại Lộc", ["Đại Lộc", "Ái Nghĩa", "Đại Hiệp", "Đại Hòa", "Đại An", "Đại Nghĩa"]],
    ["Xã Hà Nha", ["Hà Nha", "Đại Đồng", "Đại Hồng", "Đại Quang"]],
    ["Xã Thượng Đức", ["Thượng Đức", "Đại Lãnh", "Đại Hưng", "Đại Sơn"]],
    ["Xã Vu Gia", ["Vu Gia", "Đại Phong", "Đại Minh", "Đại Cường"]],
    ["Xã Phú Thuận", ["Phú Thuận", "Đại Tân", "Đại Thắng", "Đại Chánh", "Đại Thạnh"]],
    ["Xã Quế Sơn", ["Quế Sơn", "Đông Phú", "Quế Minh", "Quế An", "Quế Long", "Quế Phong"]],
    ["Xã Nông Sơn", ["Nông Sơn", "Trung Phước", "Quế Lộc"]],
    ["Xã Hiệp Đức", ["Hiệp Đức", "Tân Bình", "Quế Tân", "Quế Lưu"]],
    ["Xã Thạnh Mỹ", ["Thạnh Mỹ"]],
    ["Xã Bến Giằng", ["Bến Giằng", "Cà Dy", "Tà Bhing", "Tà Pơơ"]],
    ["Xã Nam Giang", ["Nam Giang", "Zuôih", "Chà Vàl"]],
  ];

  function folded(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/^(phuong|xa|thi tran|quan|huyen|thi xa)\s+/i, "")
      .trim()
      .toLowerCase();
  }

  const aliasToUnit = new Map();
  for (const [official, aliases] of ADMIN_UNITS) {
    aliasToUnit.set(folded(official), official);
    for (const alias of aliases) aliasToUnit.set(folded(alias), official);
  }

  function normalizeAdministrative(address) {
    const candidates = [
      address.city,
      address.town,
      address.municipality,
      address.village,
      address.suburb,
      address.city_district,
      address.county,
    ];
    for (const candidate of candidates) {
      const match = aliasToUnit.get(folded(candidate));
      if (match) return match;
    }
    return null;
  }

  function detailParts(address, administrativeUnit) {
    const values = [
      address.house_number && address.road ? `${address.house_number} ${address.road}` : address.road,
      address.neighbourhood,
      address.quarter,
      address.hamlet,
      address.residential,
      address.suburb,
      address.village,
      address.town,
    ];
    const seen = new Set();
    const parts = [];
    for (const value of values) {
      const text = String(value || "").trim();
      const key = folded(text);
      if (!text || seen.has(key) || aliasToUnit.has(key) || folded(administrativeUnit) === key) continue;
      seen.add(key);
      parts.push(text);
    }
    return parts.slice(0, 3);
  }

  function resolvedAddress(payload) {
    const address = payload && payload.address || {};
    const administrativeUnit = normalizeAdministrative(address);
    if (!administrativeUnit) return null;
    const parts = detailParts(address, administrativeUnit);
    return {
      status: "resolved",
      text: [...parts, administrativeUnit, "Thành phố Đà Nẵng"].join(", "),
      administrativeUnit,
      source: "OpenStreetMap Nominatim",
      approximate: false,
    };
  }

  function nearestPlace(longitude, latitude) {
    const places = FT.data && FT.data.PLACES || [];
    let nearest = null;
    for (const place of places) {
      if (!Array.isArray(place.ll)) continue;
      const meanLat = (latitude + place.ll[1]) * Math.PI / 360;
      const dx = (longitude - place.ll[0]) * 111.32 * Math.cos(meanLat);
      const dy = (latitude - place.ll[1]) * 110.57;
      const distanceKm = Math.hypot(dx, dy);
      if (!nearest || distanceKm < nearest.distanceKm) nearest = { place, distanceKm };
    }
    return nearest && nearest.distanceKm <= 8 ? nearest : null;
  }

  function fallback(longitude, latitude) {
    const nearest = nearestPlace(longitude, latitude);
    if (!nearest) {
      return {
        status: "unavailable",
        text: "Chưa xác định được địa chỉ",
        administrativeUnit: null,
        source: "local",
        approximate: false,
      };
    }
    return {
      status: "approximate",
      text: `Gần ${nearest.place.n}, Thành phố Đà Nẵng`,
      administrativeUnit: null,
      source: "FloodTwin gazetteer",
      approximate: true,
    };
  }

  async function lookup({ longitude, latitude, signal } = {}) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return fallback(longitude, latitude);
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (cache.has(key)) return cache.get(key);
    const query = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "vi",
    });
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`reverse geocoder ${response.status}`);
      const result = resolvedAddress(await response.json()) || fallback(longitude, latitude);
      cache.set(key, result);
      return result;
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      const result = fallback(longitude, latitude);
      cache.set(key, result);
      return result;
    }
  }

  FT.address = {
    lookup,
    normalizeAdministrative,
    clearCache() { cache.clear(); },
  };
})();
