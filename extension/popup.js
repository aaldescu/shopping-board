/* global SERVER_URL, chrome */

// Shopping Board extension popup: reads the product on the current tab
// straight from the page (so it works where the server-side fetch gets
// blocked), then creates a card on one of your boards through the
// PocketBase API.

const API = SERVER_URL.replace(/\/+$/, "");
const $ = (id) => document.getElementById(id);

const state = {
  token: "",
  userId: "",
  page: null, // { url, title, price, currency, images }
  imageIndex: 0,
  boards: [],
};

/* ---------- helpers ---------- */

function show(view) {
  for (const v of ["loading", "login", "add", "done"]) {
    $("view-" + v).hidden = v !== view;
  }
  $("logout").hidden = view === "login" || view === "loading";
}

function message(text, isError) {
  $("msg").textContent = text || "";
  $("msg").className = isError ? "err" : "muted";
}

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (state.token) headers.Authorization = state.token;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(API + path, { method: opts.method || "GET", headers, body: opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Request failed (" + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatPrice(price, currency) {
  price = String(price || "").trim();
  if (!price) return "";
  // Text scraped from the page usually carries its own currency already.
  if (!currency || /[^\d.,\s]/.test(price)) return price;
  const symbols = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbols[currency.toUpperCase()];
  if (currency.toUpperCase() === "RON") return price + " lei";
  return sym ? sym + price : price + " " + currency;
}

/* ---------- reading the page ---------- */

// Runs inside the shop's tab (injected with chrome.scripting), so it must be
// self-contained: no references to anything outside this function.
function scrapeProduct() {
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };
  const images = [];
  const addImage = (u) => {
    if (!u) return;
    try {
      u = new URL(u, location.href).href;
    } catch (_) {
      return;
    }
    if (/^https?:/.test(u) && !images.includes(u)) images.push(u);
  };

  let title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]');
  let price =
    meta('meta[property="product:price:amount"]') ||
    meta('meta[property="og:price:amount"]') ||
    meta('meta[itemprop="price"]');
  let currency =
    meta('meta[property="product:price:currency"]') ||
    meta('meta[property="og:price:currency"]') ||
    meta('meta[itemprop="priceCurrency"]');

  addImage(meta('meta[property="og:image:secure_url"]') || meta('meta[property="og:image"]'));
  addImage(meta('meta[name="twitter:image"]'));

  // Structured data (JSON-LD Product), which most shops publish for Google.
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch (_) {
      continue;
    }
    const queue = [data];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (node["@graph"]) queue.push(node["@graph"]);
      const types = [].concat(node["@type"] || []);
      if (!types.includes("Product") && !types.includes("ProductGroup")) continue;

      title = title || node.name || "";
      for (const img of [].concat(node.image || [])) {
        addImage(typeof img === "string" ? img : img && (img.url || img.contentUrl));
      }
      const offers = [].concat(node.offers || []);
      for (const offer of offers) {
        if (!offer || typeof offer !== "object") continue;
        const spec = [].concat(offer.priceSpecification || [])[0] || {};
        price = price || offer.price || offer.lowPrice || spec.price || "";
        currency = currency || offer.priceCurrency || spec.priceCurrency || "";
      }
    }
  }

  if (!price) {
    const el = document.querySelector('[itemprop="price"]');
    if (el) price = el.getAttribute("content") || el.textContent.trim();
  }

  // Large images actually shown on the page, biggest first.
  [...document.images]
    .filter((img) => img.naturalWidth >= 200 && img.naturalHeight >= 200)
    .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
    .slice(0, 12)
    .forEach((img) => addImage(img.currentSrc || img.src));

  return {
    url: location.href,
    title: String(title || document.title || "").trim(),
    price: String(price || "").trim().slice(0, 60),
    currency: String(currency || "").trim(),
    images: images.slice(0, 20),
  };
}

async function readCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) {
    throw new Error("Open a product page first.");
  }
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProduct,
    });
    if (res && res.result) return res.result;
  } catch (_) {
    // Some pages (e.g. the Chrome Web Store) can't be scripted.
  }
  return { url: tab.url, title: tab.title || "", price: "", currency: "", images: [] };
}

/* ---------- image picker ---------- */

function renderImage() {
  const imgs = state.page.images;
  const has = imgs.length > 0;
  $("image").hidden = !has;
  $("no-image").hidden = has;
  $("img-prev").hidden = $("img-next").hidden = imgs.length < 2;
  $("img-count").hidden = imgs.length < 2;
  if (has) {
    $("image").src = imgs[state.imageIndex];
    $("img-count").textContent = state.imageIndex + 1 + " / " + imgs.length;
  }
}

function stepImage(delta) {
  const n = state.page.images.length;
  if (n < 2) return;
  state.imageIndex = (state.imageIndex + delta + n) % n;
  renderImage();
}

// A broken image (hotlink-protected, 404…) just drops out of the list.
$("image").addEventListener("error", () => {
  state.page.images.splice(state.imageIndex, 1);
  if (state.imageIndex >= state.page.images.length) state.imageIndex = 0;
  renderImage();
});

/* ---------- boards ---------- */

async function loadBoards() {
  const res = await api("/api/collections/boards/records?perPage=200&sort=-updated");
  state.boards = res.items || [];
  const { lastBoard } = await chrome.storage.local.get("lastBoard");
  const select = $("board");
  select.innerHTML = "";
  for (const b of state.boards) {
    select.add(new Option(b.name, b.id, false, b.id === lastBoard));
  }
  select.add(new Option("+ New board…", "__new"));
  if (!state.boards.length) select.value = "__new";
  $("new-board-label").hidden = select.value !== "__new";
}

$("board").addEventListener("change", () => {
  $("new-board-label").hidden = $("board").value !== "__new";
  if ($("board").value === "__new") $("new-board").focus();
});

/* ---------- flows ---------- */

async function showAdd() {
  show("loading");
  message("");
  let page;
  try {
    [page] = await Promise.all([readCurrentTab(), loadBoards()]);
  } catch (err) {
    // Signed in, but nothing to add here (e.g. a chrome:// page) or the
    // boards didn't load: say why instead of spinning forever.
    $("view-loading").hidden = true;
    $("logout").hidden = false;
    message(err.message, true);
    return;
  }
  state.page = page;
  state.imageIndex = 0;
  $("title").value = page.title;
  $("price").value = formatPrice(page.price, page.currency);
  renderImage();
  show("add");
  $("title").focus();
}

async function start() {
  $("server-host").textContent = API.replace(/^https?:\/\//, "");
  const stored = await chrome.storage.local.get("token");
  state.token = stored.token || "";
  if (!state.token) {
    show("login");
    return;
  }
  try {
    // Validates the saved session and extends it.
    const auth = await api("/api/collections/users/auth-refresh", { method: "POST" });
    state.token = auth.token;
    state.userId = auth.record.id;
    await chrome.storage.local.set({ token: auth.token });
    await showAdd();
  } catch (err) {
    if (err.status === 401 || err.status === 403 || err.status === 404) {
      await chrome.storage.local.remove("token");
      state.token = "";
      show("login");
    } else {
      show("login");
      message("Can't reach " + API + " (" + err.message + ")", true);
    }
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  message("");
  try {
    const auth = await api("/api/collections/users/auth-with-password", {
      method: "POST",
      json: { identity: form.get("email"), password: form.get("password") },
    });
    state.token = auth.token;
    state.userId = auth.record.id;
    await chrome.storage.local.set({ token: auth.token });
    await showAdd();
  } catch (err) {
    message(err.status === 400 ? "Wrong email or password." : err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove("token");
  state.token = "";
  message("");
  show("login");
});

$("img-prev").addEventListener("click", () => stepImage(-1));
$("img-next").addEventListener("click", () => stepImage(1));

// Downloads the chosen image through the server's image proxy so the card
// keeps its own copy. Returns null if that fails (the card then hotlinks).
async function downloadImage(url) {
  try {
    const res = await fetch(API + "/api/img?url=" + encodeURIComponent(url), {
      headers: { Authorization: state.token },
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const ext = (type.split("/")[1] || "jpg").split(";")[0].replace("jpeg", "jpg");
    return new File([await res.blob()], "product." + ext, { type });
  } catch (_) {
    return null;
  }
}

// Places the new card just below-right of the most recently added one, so
// cards added in a row fan out instead of stacking exactly on top.
async function nextPosition(boardId) {
  try {
    const filter = encodeURIComponent('board = "' + boardId + '"');
    const res = await api(
      "/api/collections/items/records?perPage=1&sort=-created&fields=x,y&filter=" + filter
    );
    const last = res.items && res.items[0];
    if (last) return { x: Math.round(last.x || 0) + 30, y: Math.round(last.y || 0) + 30 };
  } catch (_) {
    // fall through
  }
  return { x: 0, y: 0 };
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("add-btn");
  btn.disabled = true;
  message("Adding…");
  try {
    let boardId = $("board").value;
    let boardName = $("board").selectedOptions[0] ? $("board").selectedOptions[0].text : "";
    if (boardId === "__new") {
      boardName = $("new-board").value.trim() || "Untitled board";
      const board = await api("/api/collections/boards/records", {
        method: "POST",
        json: { name: boardName, owner: state.userId },
      });
      boardId = board.id;
    }

    const pos = await nextPosition(boardId);
    const fd = new FormData();
    fd.set("board", boardId);
    fd.set("url", state.page.url);
    fd.set("title", $("title").value.trim().slice(0, 500));
    fd.set("price", $("price").value.trim().slice(0, 100));
    fd.set("note", $("note").value.trim());
    fd.set("x", String(pos.x));
    fd.set("y", String(pos.y));
    fd.set("w", "260");

    const imageUrl = state.page.images[state.imageIndex];
    if (imageUrl) {
      message("Saving image…");
      const file = await downloadImage(imageUrl);
      if (file) fd.set("image", file);
      else fd.set("image_url", imageUrl);
    }

    await api("/api/collections/items/records", { method: "POST", body: fd });
    await chrome.storage.local.set({ lastBoard: boardId });

    message("");
    $("done-board").textContent = boardName;
    $("open-board").onclick = () => {
      chrome.tabs.create({ url: API + "/b/" + boardId });
      window.close();
    };
    show("done");
  } catch (err) {
    message("Couldn't add it: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

start();
