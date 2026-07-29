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

  function restoreMapNode() {
    if (!sharedMapNode || !originalMapParent) return;
    if (originalMapNext && originalMapNext.parentNode === originalMapParent) {
      originalMapParent.insertBefore(sharedMapNode, originalMapNext);
    } else {
      originalMapParent.appendChild(sharedMapNode);
    }
  }

  function restoreSharedMapForCurrentRoute() {
    if (route.workspace === "map") {
      restoreMapNode();
      return;
    }
    const slot = mapSlot(host, route.workspace);
    if (slot) slot.appendChild(sharedMapNode);
    else restoreMapNode();
  }

  function mapSlot(root, workspace) {
    return root && root.querySelector(`[data-workspace-map-slot="${workspace}"]`);
  }

  function appendRendered(target, value) {
    if (!value) return;
    if (value instanceof Node && value !== target) {
      target.appendChild(value);
      return;
    }
    if (value !== target) throw new TypeError("workspace renderer must return a Node, DocumentFragment, or render into host");
  }

  function placeholder(workspace, error) {
    const shell = document.createElement("section");
    shell.className = "workspacePlaceholder";
    if (error) shell.classList.add("workspaceError");
    shell.setAttribute("aria-label", workspace === "city" ? "Điều hành thành phố" : "Vận hành nhà máy");
    if (error) shell.setAttribute("role", "alert");
    const head = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = workspace === "city" ? "Điều hành thành phố" : "Vận hành nhà máy";
    const note = document.createElement("p");
    note.textContent = error ? "Không tải được mô-đun dashboard. Bản đồ vận hành vẫn khả dụng." : "Không gian vận hành đang chờ mô-đun dashboard.";
    head.append(title, note);
    const slot = document.createElement("div");
    slot.className = "workspaceMapSlot";
    slot.dataset.workspaceMapSlot = workspace;
    shell.append(head, slot);
    return shell;
  }

  function reportRenderError(workspace, error) {
    const message = error && error.message ? error.message : String(error || "unknown renderer error");
    console.error(`[FT.workspaces:${workspace}] renderer failed`, error);
    if (FT.bus) FT.bus.emit("workspaceRenderError", Object.freeze({ workspace, message }));
  }

  function ensureMapSlot(target, workspace) {
    if (mapSlot(target, workspace)) return;
    const slot = document.createElement("div");
    slot.className = "workspaceMapSlot";
    slot.dataset.workspaceMapSlot = workspace;
    target.appendChild(slot);
  }

  function prepareWorkspace(workspace, renderer) {
    const staging = document.createElement("div");
    staging.className = "workspaceStageBuffer";
    const context = Object.freeze({
      workspace,
      facilityId: route.facilityId,
      host: staging,
      sharedMapNode,
      FT,
    });

    if (typeof renderer !== "function") {
      staging.appendChild(placeholder(workspace));
      return { ok: true, staging };
    }

    try {
      const before = staging.childNodes.length;
      const value = renderer(context);
      appendRendered(staging, value);
      if (staging.childNodes.length === before) {
        throw new TypeError("workspace renderer produced no content");
      }
      if (!sharedMapNode.isConnected || staging.contains(sharedMapNode)) {
        throw new TypeError("workspace renderer must not move the shared map node");
      }
      ensureMapSlot(staging, workspace);
      return { ok: true, staging };
    } catch (error) {
      restoreSharedMapForCurrentRoute();
      reportRenderError(workspace, error);
      staging.replaceChildren(placeholder(workspace, error));
      return { ok: false, staging, error };
    }
  }

  function commitWorkspace(prepared, workspace) {
    host.hidden = false;
    restoreMapNode();
    host.replaceChildren(...Array.from(prepared.staging.childNodes));
    const slot = mapSlot(host, workspace);
    if (slot) slot.appendChild(sharedMapNode);
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
      host.replaceChildren();
      host.hidden = true;
      return;
    }

    // Renderer contract: renderers may either mutate context.host directly and return
    // nothing, or return a Node/DocumentFragment. They receive normalized route data.
    // Rendering is staged off-DOM; the live host and map node are touched only after
    // the candidate content has been constructed or converted to an accessible fallback.
    commitWorkspace(prepareWorkspace(route.workspace, renderers.get(route.workspace)), route.workspace);
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
    if (route.workspace === workspace) {
      const prepared = prepareWorkspace(workspace, renderer);
      if (!prepared.ok) return false;
      renderers.set(workspace, renderer);
      commitWorkspace(prepared, workspace);
      return true;
    }
    renderers.set(workspace, renderer);
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
