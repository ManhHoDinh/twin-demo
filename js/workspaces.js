(function () {
  "use strict";
  const FT = (window.FT = window.FT || {});
  if (Object.prototype.hasOwnProperty.call(FT, "workspaces")) {
    throw new Error("FT.workspaces router is already initialized");
  }

  const ROUTES = new Set(["map", "city", "plant"]);
  const DEFAULT_FACILITY_ID = "a-vuong";
  const renderers = new Map();
  let initialized = false;
  let host = null;
  let nav = null;
  let sharedMapNode = null;
  let originalMapParent = null;
  let originalMapNext = null;
  let route = Object.freeze({ workspace: "map", facilityId: DEFAULT_FACILITY_ID });

  function normalizeWorkspace(value) {
    const key = String(value || "map").toLowerCase();
    return ROUTES.has(key) ? key : "map";
  }

  function validFacilityId(value, fallback) {
    const id = String(value || "");
    if (FT.facilities && typeof FT.facilities.get === "function" && FT.facilities.get(id)) return id;
    return fallback || DEFAULT_FACILITY_ID;
  }

  function parseRoute() {
    const params = new URLSearchParams(location.search);
    const workspace = normalizeWorkspace(params.get("workspace"));
    const currentFacility = FT.state && FT.state.selectedFacilityId || DEFAULT_FACILITY_ID;
    const facilityId = workspace === "plant"
      ? validFacilityId(params.get("facility"), currentFacility)
      : validFacilityId(currentFacility, DEFAULT_FACILITY_ID);
    return { workspace, facilityId };
  }

  function routeSearch(next) {
    const params = new URLSearchParams(location.search);
    if (next.workspace === "map") {
      params.delete("workspace");
      params.delete("facility");
    } else {
      params.set("workspace", next.workspace);
      if (next.workspace === "plant") params.set("facility", next.facilityId);
      else params.delete("facility");
    }
    const search = params.toString();
    return search ? `?${search}` : location.pathname;
  }

  function fullUrlFor(next) {
    const search = routeSearch(next);
    if (search.charAt(0) === "?") return `${location.pathname}${search}${location.hash}`;
    return `${search}${location.hash}`;
  }

  function sameRoute(a, b) {
    return !!a && !!b && a.workspace === b.workspace && a.facilityId === b.facilityId;
  }

  function clearHost() {
    if (host) host.replaceChildren();
  }

  function restoreMapNode() {
    if (!sharedMapNode || !originalMapParent) return;
    if (originalMapNext && originalMapNext.parentNode === originalMapParent) {
      originalMapParent.insertBefore(sharedMapNode, originalMapNext);
    } else {
      originalMapParent.appendChild(sharedMapNode);
    }
  }

  function mapSlot(workspace) {
    return host && host.querySelector(`[data-workspace-map-slot="${workspace}"]`);
  }

  function appendRendered(value) {
    if (!value) return;
    if (value instanceof Node && value !== host) host.appendChild(value);
  }

  function placeholder(workspace) {
    const shell = document.createElement("section");
    shell.className = "workspacePlaceholder";
    shell.setAttribute("aria-label", workspace === "city" ? "Điều hành thành phố" : "Vận hành nhà máy");
    const head = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = workspace === "city" ? "Điều hành thành phố" : "Vận hành nhà máy";
    const note = document.createElement("p");
    note.textContent = "Không gian vận hành đang chờ mô-đun dashboard.";
    head.append(title, note);
    const slot = document.createElement("div");
    slot.className = "workspaceMapSlot";
    slot.dataset.workspaceMapSlot = workspace;
    shell.append(head, slot);
    return shell;
  }

  function render() {
    if (!initialized || !host || !sharedMapNode) return;
    document.body.dataset.workspace = route.workspace;
    if (FT.state) {
      FT.state.workspace = route.workspace;
      FT.state.selectedFacilityId = route.facilityId;
    }
    nav && nav.querySelectorAll("[data-workspace]").forEach((button) => {
      const active = button.dataset.workspace === route.workspace;
      button.classList.toggle("isActive", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    if (route.workspace === "map") {
      restoreMapNode();
      clearHost();
      host.hidden = true;
      return;
    }

    host.hidden = false;
    clearHost();
    const renderer = renderers.get(route.workspace);
    const context = Object.freeze({
      workspace: route.workspace,
      facilityId: route.facilityId,
      host,
      sharedMapNode,
      FT,
    });

    // Renderer contract: renderers may either mutate context.host directly and return
    // nothing, or return a Node/DocumentFragment. They receive normalized route data.
    const before = host.childNodes.length;
    if (typeof renderer === "function") appendRendered(renderer(context));
    if (!renderer || host.childNodes.length === before) host.appendChild(placeholder(route.workspace));

    const slot = mapSlot(route.workspace);
    if (slot) slot.appendChild(sharedMapNode);
  }

  function applyRoute(next, options) {
    const normalized = {
      workspace: normalizeWorkspace(next && next.workspace),
      facilityId: validFacilityId(next && next.facilityId, route.facilityId),
    };
    if (normalized.workspace !== "plant") normalized.facilityId = validFacilityId(route.facilityId, DEFAULT_FACILITY_ID);
    const changed = !sameRoute(route, normalized);
    route = Object.freeze(normalized);
    render();
    if (options && options.push && changed) {
      const nextUrl = fullUrlFor(route);
      const currentUrl = `${location.pathname}${location.search}${location.hash}`;
      if (nextUrl !== currentUrl) history.pushState(route, "", nextUrl);
    }
    if (FT.bus && changed) FT.bus.emit("workspaceChanged", current());
  }

  function navigate(name, options) {
    const nextWorkspace = normalizeWorkspace(name);
    const facilityId = nextWorkspace === "plant"
      ? validFacilityId(options && options.facilityId, route.facilityId)
      : route.facilityId;
    applyRoute({ workspace: nextWorkspace, facilityId }, { push: true });
  }

  function current() {
    return Object.freeze({ workspace: route.workspace, facilityId: route.facilityId });
  }

  function register(name, renderer) {
    const workspace = normalizeWorkspace(name);
    if (workspace === "map" || typeof renderer !== "function") return false;
    renderers.set(workspace, renderer);
    if (route.workspace === workspace) render();
    return true;
  }

  function init() {
    if (initialized) return;
    host = document.getElementById("roleWorkspaceHost");
    nav = document.getElementById("workspaceNav");
    sharedMapNode = document.getElementById("stageWrap");
    if (!host || !sharedMapNode) return;
    originalMapParent = sharedMapNode.parentNode;
    originalMapNext = sharedMapNode.nextSibling;
    initialized = true;

    if (nav) {
      nav.addEventListener("click", (event) => {
        const button = event.target.closest("[data-workspace]");
        if (!button || !nav.contains(button)) return;
        navigate(button.dataset.workspace, {});
      });
    }
    window.addEventListener("popstate", () => applyRoute(parseRoute(), { push: false }));
    route = Object.freeze(parseRoute());
    history.replaceState(route, "", fullUrlFor(route));
    render();
    if (FT.bus) FT.bus.emit("workspaceChanged", current());
  }

  const api = {};
  Object.defineProperties(api, {
    register: { value: register, enumerable: true },
    navigate: { value: navigate, enumerable: true },
    current: { value: current, enumerable: true },
    render: { value: render, enumerable: true },
    sharedMapNode: { get: () => sharedMapNode, enumerable: true },
  });

  Object.defineProperty(FT, "workspaces", {
    value: api,
    enumerable: true,
    writable: false,
    configurable: false,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
