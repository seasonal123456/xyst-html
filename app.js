(function () {
  const STORAGE_KEY = "project-card-tool:v1";
  const IMAGE_DB = "project-card-tool-images";
  const IMAGE_STORE = "images";

  const $ = (id) => document.getElementById(id);

  const themes = {
    teal: { name: "地铁通勤优选", accent: "#008b8f", deep: "#003b74", price: "#f7dd8b", soft: "#e8f7f5" },
    gold: { name: "高性价比优选", accent: "#d58318", deep: "#003b74", price: "#ffd98a", soft: "#fff6e5" },
    green: { name: "科技孵化优选", accent: "#4f9d4f", deep: "#004e92", price: "#e6f46d", soft: "#eef9ee" },
    blue: { name: "综合推荐", accent: "#1769aa", deep: "#003b74", price: "#d7ebff", soft: "#eef6ff" }
  };

  const visualPresets = [
    { code: "WG", name: "白金", colorScheme: "白/金配色。象牙白、暖白、香槟金、浅灰阴影，干净高级，类似高端地产样板册。" },
    { code: "YG", name: "黄灰", colorScheme: "黄/灰配色。暖黄色重点、浅灰背景、深灰文字，商务但温暖，避免廉价亮黄。" },
    { code: "GG", name: "绿金", colorScheme: "绿/金配色。深翡翠绿、雾绿色、香槟金高光、白色玻璃面板，稳重有价值感。" },
    { code: "BY", name: "棕黄", colorScheme: "棕/黄配色。深咖棕、焦糖黄、米白、古铜金，成熟工业地产质感，温暖可信。" },
    { code: "BK", name: "黑金", colorScheme: "黑/金配色。炭黑、深灰、香槟金、少量白色高光，高端克制，不要夜店风。" },
    { code: "BS", name: "蓝银", colorScheme: "蓝/银配色。深蓝、雾蓝、银白、冷灰，现代商务科技感，光效克制。" },
    { code: "CW", name: "青白", colorScheme: "青/白配色。青绿色、冰白、浅灰蓝、透明玻璃质感，清爽现代，适合手机阅读。" },
    { code: "GO", name: "灰橙", colorScheme: "灰/橙配色。高级中性灰、柔和橙色重点、白色信息层，理性但有成交感。" },
    { code: "GM", name: "墨绿米白", colorScheme: "墨绿/米白配色。墨绿色、米白、浅金、低饱和灰，稳重、自然、企业级。" },
    { code: "RG", name: "酒红金", colorScheme: "酒红/金配色。深酒红、暗红棕、香槟金、暖白，稀缺感和价值感强，保持克制。" },
    { code: "PS", name: "紫银", colorScheme: "紫/银配色。深紫灰、银白、浅紫光、冷灰，轻微未来感，避免浓紫廉价感。" },
    { code: "LG", name: "浅蓝灰", colorScheme: "浅蓝/灰配色。浅蓝灰、云白、银灰、少量深蓝文字，明亮干净，低压专业。" }
  ];

  const restrainedVisualDirection = "克制高级的单一主卖点招商卡，不要饱满堆料。只把一个最有成交力的条件做成最大视觉锚点，其他信息低调辅助。大留白，少量毛玻璃信息层，轻抠像厂房或产业建筑主视觉，少量叠层，柔和阴影，细腻材质，手机端清楚读到核心卖点。不要过多图标、不要密集模块、不要全屏强光效。";

  let appConfig = {
    production: false,
    demoSessionEnabled: false,
    adminEnabled: false,
    generationEnabled: false,
    ssoConfigured: false
  };
  let state = loadState();
  let currentRows = [];
  let currentImages = [];
  let currentBatch = null;
  let currentGenerated = [];
  let currentPreviewIndex = 0;

  const sampleCards = [
    { name: "顺北睿创产业园", tag: "高性价比优选", src: "./assets/examples/sample-shunbei.png" },
    { name: "莱茵科技园", tag: "地铁通勤优选", src: "./assets/examples/sample-laiyin.png" },
    { name: "精密仪器科技园", tag: "科技孵化优选", src: "./assets/examples/sample-jingmi.png" }
  ];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await loadAppConfig();
    if (appConfig.demoSessionEnabled) ensureSeedCompany();
    const ssoAttempted = await handleSsoFromUrl();
    if (!ssoAttempted && appConfig.demoSessionEnabled) ensureLocalDemoSession();
    bindNav();
    bindWorkspace();
    restoreProjectDraft();
    renderAll();
  }

  async function loadAppConfig() {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok) appConfig = { ...appConfig, ...result };
    } catch {
      appConfig = { ...appConfig, demoSessionEnabled: true };
    }
  }

  function loadState() {
    const fallback = {
      sessionUserId: null,
      companies: [],
      users: [],
      batches: [],
      jobs: [],
      cards: [],
      usageLogs: [],
      projectDraft: {
        projectText: "",
        contactName: "",
        contactPhone: "",
        updatedAt: ""
      },
      selectedVisualPresetCode: "WG",
      sessionToken: ""
    };
    try {
      return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
    } catch {
      return fallback;
    }
  }

  function saveState() {
    const compact = {
      ...state,
      cards: state.cards.map(({ imageDataUrl, ...card }) => card)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function stableHash(value) {
    return Array.from(String(value || "")).reduce((hash, char) => {
      return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }, 0);
  }

  function pickVisualPreset(seed) {
    const index = Math.abs(stableHash(seed)) % visualPresets.length;
    return visualPresets[index];
  }

  function getVisualPreset(code) {
    return visualPresets.find((preset) => preset.code === code) || visualPresets[0];
  }

  function currentVisualPreset() {
    return getVisualPreset(state.selectedVisualPresetCode || "WG");
  }

  function presetSwatch(code) {
    const swatches = {
      WG: "linear-gradient(135deg, #fffaf0 0 48%, #d6ad52 48% 100%)",
      YG: "linear-gradient(135deg, #f8c84a 0 48%, #7c7f86 48% 100%)",
      GG: "linear-gradient(135deg, #0f5c46 0 48%, #d6b35f 48% 100%)",
      BY: "linear-gradient(135deg, #5a3724 0 48%, #d39b32 48% 100%)",
      BK: "linear-gradient(135deg, #161616 0 48%, #caa24a 48% 100%)",
      BS: "linear-gradient(135deg, #123d72 0 48%, #d9e1ea 48% 100%)",
      CW: "linear-gradient(135deg, #00a6a6 0 48%, #f7fcff 48% 100%)",
      GO: "linear-gradient(135deg, #7a7d82 0 48%, #e98d35 48% 100%)",
      GM: "linear-gradient(135deg, #123f35 0 48%, #efe6d1 48% 100%)",
      RG: "linear-gradient(135deg, #6e1f2c 0 48%, #d4ad5f 48% 100%)",
      PS: "linear-gradient(135deg, #4b3a68 0 48%, #d8dce8 48% 100%)",
      LG: "linear-gradient(135deg, #bfd4e8 0 48%, #6f7e8f 48% 100%)"
    };
    return swatches[code] || swatches.WG;
  }

  function inferFocusCondition(row) {
    const candidates = [
      row.rentQuote && `租金单价：${row.rentQuote}`,
      row.monthlyRentAmount && `月租金：${formatMoney(row.monthlyRentAmount)}元/月`,
      row.monthlyRentArea && `面积：${row.monthlyRentArea}`,
      row.powerSupply && `用电量：${row.powerSupply}`,
      row.southStationCommute && `通勤：${row.southStationCommute}`,
      row.projectFeatures
    ].filter(Boolean);
    return candidates[0] || row.projectName || "按提交文案提炼一个核心卖点";
  }

  function batchVisualFields(batch, row) {
    if (row?.colorScheme || row?.focusCondition || row?.visualDirection) {
      return {
        visualPresetCode: row.visualPresetCode || "",
        visualPresetName: row.visualPresetName || "",
        colorScheme: row.colorScheme || "",
        focusCondition: row.focusCondition || inferFocusCondition(row || {}),
        visualDirection: row.visualDirection || restrainedVisualDirection
      };
    }
    const preset = batch?.visualPreset || pickVisualPreset(`${batch?.id || ""}:${row?.sourceText || row?.projectName || ""}`);
    return {
      visualPresetCode: preset.code,
      visualPresetName: preset.name,
      colorScheme: preset.colorScheme,
      focusCondition: inferFocusCondition(row || {}),
      visualDirection: restrainedVisualDirection
    };
  }

  function renderStylePresets() {
    const grid = $("stylePresetGrid");
    if (!grid) return;
    const selected = currentVisualPreset();
    if ($("stylePresetName")) $("stylePresetName").textContent = `精致 · ${selected.name}`;
    if ($("stylePresetHint")) $("stylePresetHint").textContent = "单重点、克制高级、适合直接转发";
    grid.innerHTML = visualPresets.map((preset) => `
      <button
        type="button"
        class="style-preset-btn${preset.code === selected.code ? " active" : ""}"
        data-preset-code="${escapeHtml(preset.code)}"
        aria-pressed="${preset.code === selected.code ? "true" : "false"}"
        title="${escapeHtml(preset.colorScheme)}"
      >
        <span class="style-swatch" style="background:${presetSwatch(preset.code)}"></span>
        <span>${escapeHtml(preset.name)}</span>
      </button>
    `).join("");
  }

  function selectVisualPreset(code) {
    const preset = getVisualPreset(code);
    state.selectedVisualPresetCode = preset.code;
    if (currentBatch) {
      currentBatch.visualPreset = preset;
      currentBatch.rows = currentRows;
    }
    saveState();
    renderStylePresets();
    renderPreview();
    toast(`已选择${preset.name}配色。`, "ok");
  }

  function todayCode() {
    const d = new Date();
    const y = String(d.getFullYear()).slice(2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  function ensureSeedCompany() {
    if (state.companies.length) return;
    state.companies.push({
      id: uid("company"),
      name: "演示公司",
      inviteCode: "DEMO2026",
      planType: "time_unlimited",
      creditsRemaining: 20,
      validUntil: addDays(new Date(), 30).toISOString().slice(0, 10),
      status: "active",
      createdAt: new Date().toISOString()
    });
    saveState();
  }

  function ensureLocalDemoSession() {
    if (!appConfig.demoSessionEnabled) return;
    if (currentUser() && currentCompany()) return;
    const company = state.companies.find((c) => c.inviteCode === "DEMO2026" && c.status === "active") || state.companies[0];
    if (!company) return;
    let user = state.users.find((u) => u.phone === "local-demo-member");
    if (!user) {
      user = {
        id: uid("user"),
        name: "官网会员",
        phone: "local-demo-member",
        password: "",
        companyId: company.id,
        role: "member",
        authSource: "website_sso_demo_hidden",
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
    } else {
      user.companyId = company.id;
      user.authSource = "website_sso_demo_hidden";
    }
    state.sessionUserId = user.id;
    saveState();
  }

  async function handleSsoFromUrl() {
    const url = new URL(window.location.href);
    const ticket = url.searchParams.get("sso_ticket");
    if (!ticket) return false;

    try {
      const response = await fetch("/api/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.session) {
        throw new Error(result.error || `SSO 登录失败：HTTP ${response.status}`);
      }
      applySsoSession(result.session);
      stripSsoTicketFromUrl(url);
      toast("已通过官网会员进入工具。", "ok");
    } catch (error) {
      console.error(error);
      stripSsoTicketFromUrl(url);
      toast(error.message || "官网会员登录凭证无效，请从官网重新进入。", "bad");
    }
    return true;
  }

  function applySsoSession(session) {
    const companyId = String(session.companyId || `sso_company_${session.userId || "default"}`);
    const userId = `website:${String(session.userId || session.email || "member")}`;
    const now = new Date().toISOString();
    let company = state.companies.find((item) => item.id === companyId);
    const nextCompany = {
      id: companyId,
      name: session.companyName || "官网会员权益",
      inviteCode: "",
      planType: session.planType === "credits" ? "credits" : "time_unlimited",
      creditsRemaining: Number.isFinite(Number(session.creditsRemaining)) ? Number(session.creditsRemaining) : 20,
      validUntil: session.validUntil || addDays(new Date(), 30).toISOString().slice(0, 10),
      status: "active"
    };
    if (company) {
      Object.assign(company, nextCompany, { updatedAt: now });
    } else {
      company = { ...nextCompany, createdAt: now };
      state.companies.push(company);
    }

    let user = state.users.find((item) => item.id === userId || item.externalCustomerId === session.userId);
    const nextUser = {
      id: userId,
      externalCustomerId: String(session.userId || ""),
      name: session.name || session.email || "官网会员",
      phone: session.email || `website:${session.userId || "member"}`,
      password: "",
      companyId: company.id,
      role: "member",
      authSource: session.authSource || "website_sso",
      sessionToken: session.sessionToken || ""
    };
    if (user) {
      Object.assign(user, nextUser, { updatedAt: now });
    } else {
      user = { ...nextUser, createdAt: now };
      state.users.push(user);
    }

    state.sessionUserId = user.id;
    state.sessionToken = session.sessionToken || "";
    saveState();
  }

  function stripSsoTicketFromUrl(url) {
    url.searchParams.delete("sso_ticket");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl || "/");
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function currentUser() {
    return state.users.find((u) => u.id === state.sessionUserId) || null;
  }

  function currentCompany() {
    const user = currentUser();
    return user ? state.companies.find((c) => c.id === user.companyId) || null : null;
  }

  function hasGenerationSession() {
    return hasToolSessionToken() || (appConfig.demoSessionEnabled && !appConfig.ssoConfigured);
  }

  function bindNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.id === "examplesNavBtn") {
          $("examplesSection").scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        switchView(btn.dataset.view);
      });
    });
  }

  function bindWorkspace() {
    $("parseBtn").addEventListener("click", parseSelectedTable);
    $("generateBtn").addEventListener("click", generateCards);
    $("imageInput").addEventListener("change", readImages);
    if ($("stylePresetGrid")) {
      $("stylePresetGrid").addEventListener("click", (event) => {
        const button = event.target.closest("[data-preset-code]");
        if (button) selectVisualPreset(button.dataset.presetCode);
      });
    }
    ["projectTextInput", "contactNameInput", "contactPhoneInput"].forEach((id) => {
      const input = $(id);
      if (input) input.addEventListener("input", markProjectInputsDirty);
    });
    if ($("accountBtn")) $("accountBtn").addEventListener("click", () => switchView("history"));
    if ($("prevPreviewBtn")) $("prevPreviewBtn").addEventListener("click", () => movePreview(-1));
    if ($("nextPreviewBtn")) $("nextPreviewBtn").addEventListener("click", () => movePreview(1));
    if ($("regenerateBtn")) $("regenerateBtn").addEventListener("click", regenerateCurrentCard);
    if ($("zoomPreviewBtn")) $("zoomPreviewBtn").addEventListener("click", zoomPreview);
    if ($("exportBtn")) $("exportBtn").addEventListener("click", exportCurrentPreview);
  }

  function restoreProjectDraft() {
    const draft = state.projectDraft || {};
    const projectTextInput = $("projectTextInput");
    const contactNameInput = $("contactNameInput");
    const contactPhoneInput = $("contactPhoneInput");
    if (projectTextInput && draft.projectText) projectTextInput.value = draft.projectText;
    if (contactNameInput && draft.contactName) contactNameInput.value = draft.contactName;
    if (contactPhoneInput && draft.contactPhone) contactPhoneInput.value = draft.contactPhone;
    if (draft.projectText && $("validationBox")) {
      $("validationBox").className = "notice muted";
      $("validationBox").textContent = "已保留上次项目资料，可直接修改或重新整理后生成。";
    }
  }

  function saveProjectDraftFromInputs() {
    const projectText = ($("projectTextInput")?.value || "").trim();
    const contactName = ($("contactNameInput")?.value || "").trim();
    const contactPhone = ($("contactPhoneInput")?.value || "").trim();
    state.projectDraft = {
      projectText,
      contactName,
      contactPhone,
      updatedAt: projectText || contactName || contactPhone ? new Date().toISOString() : ""
    };
    saveState();
  }

  function markProjectInputsDirty() {
    saveProjectDraftFromInputs();
    if (!currentBatch && !currentRows.length) return;
    currentRows = [];
    currentBatch = null;
    $("generateBtn").disabled = true;
    const box = $("validationBox");
    if (box) {
      box.className = "notice muted";
      box.textContent = "资料已修改，请重新整理后生成。";
    }
    if ($("previewTable")) {
      $("previewTable").className = "mobile-card table-empty";
      $("previewTable").textContent = "资料已修改，请重新整理。";
    }
  }

  function switchView(viewName) {
    const target = $(`${viewName}View`);
    if (!target) return;
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewName));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    target.classList.add("active");
    renderHistory();
    renderAdmin();
  }

  function renderAll() {
    renderAuth();
    renderQuota();
    renderStylePresets();
    renderResultGrid();
    renderHistory();
    renderAdmin();
  }

  function renderAuth() {
    if (!$("authPanel")) return;
    const user = currentUser();
    const company = currentCompany();
    if (user && company && hasToolSessionToken()) {
      $("authPanel").innerHTML = "";
      return;
    }
    if (user && company && appConfig.demoSessionEnabled && !appConfig.ssoConfigured) {
      $("authPanel").innerHTML = "";
      return;
    }

    $("authPanel").innerHTML = `
      <div class="notice warn">
        请从官网会员中心进入项目推荐卡生成器。直接打开本页可以整理资料和预览页面，但不能生成推荐卡。
      </div>
    `;
  }

  function ssoDemoLogin() {
    const name = $("ssoName").value.trim();
    const phone = $("ssoPhone").value.trim();
    const code = $("ssoCompanyCode").value.trim().toUpperCase();
    const company = state.companies.find((c) => c.inviteCode.toUpperCase() === code && c.status === "active");
    if (!name || !phone || !code) return toast("请填写会员姓名、官网手机号和公司码。", "bad");
    if (!company) return toast("公司码无效或公司已停用。", "bad");

    let user = state.users.find((u) => u.phone === phone);
    if (user) {
      user.name = name;
      user.companyId = company.id;
      user.authSource = "website_sso_demo";
    } else {
      user = {
        id: uid("user"),
        name,
        phone,
        password: "",
        companyId: company.id,
        role: "member",
        authSource: "website_sso_demo",
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
    }

    state.sessionUserId = user.id;
    saveState();
    renderAll();
  }

  function login() {
    const phone = $("loginPhone").value.trim();
    const password = $("loginPassword").value;
    const user = state.users.find((u) => u.phone === phone && u.password === password);
    if (!user) return toast("手机号或密码不正确。", "bad");
    state.sessionUserId = user.id;
    saveState();
    renderAll();
  }

  function register() {
    const name = $("regName").value.trim();
    const phone = $("regPhone").value.trim();
    const password = $("regPassword").value;
    const code = $("regCode").value.trim().toUpperCase();
    const company = state.companies.find((c) => c.inviteCode.toUpperCase() === code && c.status === "active");
    if (!name || !phone || password.length < 4 || !code) return toast("请完整填写注册信息，密码至少 4 位。", "bad");
    if (state.users.some((u) => u.phone === phone)) return toast("该手机号已注册。", "bad");
    if (!company) return toast("公司码无效或公司已停用。", "bad");
    const user = { id: uid("user"), name, phone, password, companyId: company.id, role: "member", createdAt: new Date().toISOString() };
    state.users.push(user);
    state.sessionUserId = user.id;
    saveState();
    renderAll();
  }

  function renderQuota() {
    const company = currentCompany();
    if (!company) {
      if ($("quotaBadge")) $("quotaBadge").textContent = "未登录";
      $("generateBtn").disabled = true;
      return;
    }
    if (!hasGenerationSession()) {
      if ($("quotaBadge")) $("quotaBadge").textContent = "请从官网进入";
      $("generateBtn").disabled = true;
      return;
    }
    if (company.planType === "time_unlimited") {
      if ($("quotaBadge")) $("quotaBadge").textContent = `有效期至 ${company.validUntil}`;
    } else {
      if ($("quotaBadge")) $("quotaBadge").textContent = `剩余 ${company.creditsRemaining} 次`;
    }
    $("generateBtn").disabled = !currentRows.length;
  }

  async function readImages() {
    const files = Array.from($("imageInput").files || []);
    const selected = files.slice(0, 1);
    const oversized = selected.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      currentImages = [];
      $("imageInput").value = "";
      toast("单张图片请控制在 8MB 以内；项目图片也可以不上传。", "bad");
      renderPreview();
      return;
    }
    try {
      currentImages = await Promise.all(selected.map(async (file, index) => ({
        id: uid("image"),
        name: file.name,
        index,
        dataUrl: await compressImageFile(file)
      })));
      if (files.length > 1) toast("已读取第 1 张展示图片；当前版本每次限 1 张。", "warn");
      else toast(currentImages.length ? "已读取 1 张展示图片。" : "未选择展示图片，将使用默认画面。", currentImages.length ? "ok" : "warn");
      renderPreview();
    } catch (error) {
      console.error(error);
      currentImages = [];
      toast("图片读取失败，请换用 jpg / png 图片。", "bad");
      renderPreview();
    }
  }

  async function parseSelectedTable() {
    if (!currentUser()) return toast("请先登录员工账号。", "bad");
    const textInput = $("projectTextInput");
    const projectText = textInput ? textInput.value.trim() : "";
    const contactName = ($("contactNameInput")?.value || "").trim();
    const contactPhone = ($("contactPhoneInput")?.value || "").trim();
    const fileInput = $("excelInput");
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    try {
      if (projectText) {
        saveProjectDraftFromInputs();
        currentRows = [parseProjectText(projectText, { contactName, contactPhone })];
        const validation = validateRows(currentRows);
        const company = currentCompany();
        const user = currentUser();
        const batchId = uid("batch");
        currentBatch = {
          id: batchId,
          companyId: company.id,
          createdByUserId: user.id,
          sourceFileName: "手机文本资料",
          sourceType: "text",
          sourceText: projectText,
          visualPreset: currentVisualPreset(),
          rowCount: currentRows.length,
          validRowCount: currentRows.length - validation.errors.length,
          errors: validation.errors,
          rows: currentRows,
          sourceStored: false,
          status: validation.errors.length ? "invalid" : "ready",
          createdAt: new Date().toISOString()
        };
        state.batches.push(currentBatch);
        saveState();
        renderPreview();
        renderQuota();
        $("generateBtn").disabled = !hasGenerationSession() || !!validation.errors.length || !currentRows.length;
        toast("资料已整理，可以生成。", "ok");
        return;
      }

      if (!file) return toast("请先粘贴项目资料。", "bad");

      let rows;
      const sourceDataUrl = await readAsDataUrl(file);
      if (/\.csv$/i.test(file.name)) {
        rows = parseCsv(await readAsText(file));
      } else {
        if (!window.XLSX) return toast("Excel 解析库还未加载，请稍后再试。", "bad");
        const data = await readAsArrayBuffer(file);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }
      currentRows = normalizeRows(rows);
      const validation = validateRows(currentRows);
      const company = currentCompany();
      const user = currentUser();
      const batchId = uid("batch");
      currentBatch = {
        id: batchId,
        companyId: company.id,
        createdByUserId: user.id,
        sourceFileName: file.name,
        sourceType: "file",
        visualPreset: currentVisualPreset(),
        rowCount: currentRows.length,
        validRowCount: currentRows.length - validation.errors.length,
        errors: validation.errors,
        rows: currentRows,
        sourceStored: true,
        status: validation.errors.length ? "invalid" : "ready",
        createdAt: new Date().toISOString()
      };
      await putImage(`source:${currentBatch.id}`, sourceDataUrl);
      state.batches.push(currentBatch);
      saveState();
      renderPreview();
      renderQuota();
      $("generateBtn").disabled = !hasGenerationSession() || !!validation.errors.length || !currentRows.length;
      toast(validation.errors.length ? "资料已整理，但存在需要修正的内容。" : "资料已整理，可以生成。", validation.errors.length ? "warn" : "ok");
    } catch (error) {
      console.error(error);
      toast(`整理失败：${error.message || "资料格式暂不支持"}`, "bad");
    }
  }

  function parseProjectText(text, options = {}) {
    const compact = text.replace(/\s+/g, " ").trim();
    const sentences = compact.split(/[。；;！!？?\n]/).map((item) => item.trim()).filter(Boolean);
    const areaMatch = compact.match(/(\d+(?:\.\d+)?)\s*(?:㎡|平米|平方米|平方|平)(?!方公里)/);
    const unitRentMatch = compact.match(/(\d+(?:\.\d+)?)\s*元\s*(?:\/|每)?\s*(?:㎡|平米|平方米|平方|平)\s*(?:\/|每)?\s*月?/);
    const totalRentMatch = compact.match(/(?:月租金|总月租金|月租|每月租金)[约为是：:\s]*(\d[\d,]*(?:\.\d+)?)/);
    const area = areaMatch ? Number(areaMatch[1]) : 0;
    const unitRent = unitRentMatch ? Number(unitRentMatch[1]) : 0;
    const totalRent = totalRentMatch ? Number(totalRentMatch[1].replace(/,/g, "")) : 0;
    const monthlyRentAmount = totalRent || (area && unitRent ? Math.round(area * unitRent) : "");
    const powerSupply = extractSegment(compact, /用电量[约为是：:\s]*(\d+(?:\.\d+)?\s*(?:kva|kw|千伏安|千瓦))/i);
    const locationSentence = extractSegment(compact, /位于([^，。；;]+)/) || extractSegment(compact, /地址[：:\s]*([^，。；;]+)/) || pickSentence(sentences, /区位|地铁口|附近|佛山|广州|番禺|南沙|顺德|陈村/);
    const distanceTraffic = extractSegment(compact, /距离([^，。；;]+(?:分钟|公里|km|KM|车程))/);
    const metroTraffic = extractSegment(compact, /靠近([^，。；;]+(?:地铁|高铁|高速|南站|机场|港口))/);
    const trafficSentence = [distanceTraffic, metroTraffic].filter(Boolean).join("，") || pickSentence(sentences, /交通|地铁|高铁|高速|通勤|车程|南站|机场|港口/);
    const environmentSentence = extractSegment(compact, /园区有([^。；;]+)/) || extractSegment(compact, /配套[：:\s]*([^。；;]+)/) || pickSentence(sentences, /配套|停车|宿舍|食堂|卸货|消防|层高|电梯|环境/);
    const featureSentence = extractSegment(compact, /适合([^。；;]+)/) || pickSentence(sentences, /适合|产业|行业|企业|制造|研发|办公|仓库|厂房|耗材|智能|科技/) || sentences[0] || compact;
    const projectName = extractProjectName(compact);
    const reason = pickSentence(sentences, /推荐|优势|适合|性价比|通勤|配套|区位/);

    return {
      rowIndex: 1,
      serial: "1",
      projectName,
      location: cleanField(locationSentence),
      projectFeatures: cleanField(featureSentence),
      powerSupply: cleanField(powerSupply),
      southStationCommute: cleanField(/南站/.test(trafficSentence) ? trafficSentence : ""),
      cityDriveTime: cleanField(trafficSentence),
      rentQuote: unitRent ? `${unitRent}元/㎡/月` : cleanField(pickSentence(sentences, /租金|报价|元|月租/)),
      monthlyRentArea: area ? `${area}㎡` : "",
      monthlyRentAmount,
      environmentDescription: cleanField(environmentSentence),
      recommendationReason: cleanField(reason),
      contactName: cleanField(options.contactName),
      contactPhone: cleanField(options.contactPhone),
      tag: inferTag({ text: compact }),
      imageFileName: "",
      theme: normalizeTheme(compact),
      sourceText: compact,
      rawJson: { 项目资料: compact }
    };
  }

  function pickSentence(sentences, pattern) {
    return sentences.find((sentence) => pattern.test(sentence)) || "";
  }

  function extractSegment(text, pattern) {
    const match = text.match(pattern);
    return match ? cleanField(match[1] || match[0]) : "";
  }

  function extractProjectName(text) {
    const labeled = text.match(/(?:项目名|项目名称|园区名称|名称)[：:\s]*([^，。；;\n]{2,24})/);
    if (labeled) return cleanField(labeled[1]);
    const leadingName = text.match(/^([^，。；;\n]{2,24}?)(?:，|。|；|;|位于|坐落|面积|租金|价格|报价)/);
    if (leadingName && /产业园|科技园|工业园|厂房|仓库|项目|中心|基地|大厦|写字楼/.test(leadingName[1])) return cleanField(leadingName[1]);
    const park = text.match(/([^，。；;\n]{2,24}(?:产业园|科技园|工业园|仓库|厂房|项目|中心|基地|大厦|写字楼))/);
    if (park) return cleanField(park[1]);
    return "";
  }

  function cleanField(value) {
    return String(value || "").replace(/^[，。；;、\s]+|[，。；;、\s]+$/g, "").trim();
  }

  function parseCsv(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row = {};
      headers.forEach((header, index) => row[header] = values[index] || "");
      return row;
    });
  }

  function splitCsvLine(line) {
    const out = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    out.push(cell.trim());
    return out;
  }

  function normalizeRows(rows) {
    return rows.map((row, index) => {
      const get = (...names) => {
        for (const name of names) {
          const key = Object.keys(row).find((k) => k.trim() === name || k.trim().toLowerCase() === name.toLowerCase());
          if (key && row[key] !== undefined) return String(row[key]).trim();
        }
        return "";
      };
      const rentArea = get("面积", "月租面积", "租金面积") || "2300㎡月租金";
      return {
        rowIndex: index + 2,
        serial: get("序号") || String(index + 1),
        projectName: get("项目名", "项目名称"),
        location: get("位置", "区域"),
        projectFeatures: get("项目特点", "特点"),
        southStationCommute: get("广州南站通勤", "南站通勤"),
        cityDriveTime: get("石牌桥天河城车程", "天河城车程", "车程"),
        rentQuote: get("租金报价", "租金"),
        monthlyRentArea: rentArea.includes("月租金") ? rentArea : `${rentArea}月租金`,
        monthlyRentAmount: get("2300㎡月租金", "月租金", "总月租金"),
        environmentDescription: get("环境描述", "环境"),
        recommendationReason: get("推荐理由", "理由"),
        tag: get("推荐标签", "标签") || inferTag(row),
        imageFileName: get("图片文件名", "图片", "图片名"),
        theme: normalizeTheme(get("主题", "主题色", "theme")),
        rawJson: row
      };
    });
  }

  function inferTag(row) {
    const text = JSON.stringify(row);
    if (/地铁|通勤|站/.test(text)) return "地铁通勤优选";
    if (/租金|便宜|性价比/.test(text)) return "高性价比优选";
    if (/科技|孵化|研发/.test(text)) return "科技孵化优选";
    return "综合推荐";
  }

  function normalizeTheme(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("gold") || text.includes("橙") || text.includes("金") || text.includes("性价比")) return "gold";
    if (text.includes("green") || text.includes("绿") || text.includes("孵化")) return "green";
    if (text.includes("blue") || text.includes("蓝") || text.includes("综合")) return "blue";
    return "teal";
  }

  function validateRows(rows) {
    const errors = [];
    if (!rows.length) errors.push("请先提供项目资料。");
    return { errors };
  }

  function renderPreview() {
    const box = $("validationBox");
    if (!currentBatch) {
      box.className = "notice muted";
      box.textContent = "等待粘贴项目资料。项目图片为可选项；未上传时会使用默认画面生成。";
      if ($("previewTable")) {
        $("previewTable").className = "mobile-card table-empty";
        $("previewTable").textContent = "暂无已整理资料。";
      }
      return;
    }
    if (currentBatch.errors.length) {
      box.className = "notice bad";
      box.innerHTML = currentBatch.errors.slice(0, 6).map(escapeHtml).join("<br>");
    } else {
      box.className = "notice ok";
      const readyLabel = currentBatch.sourceType === "text" ? "项目资料已整理" : `项目资料已整理：${currentBatch.rowCount} 条`;
      const presetName = currentBatch.visualPreset?.name || currentVisualPreset().name;
      box.textContent = currentImages.length
        ? `${readyLabel}，展示图片 ${currentImages.length} 张，配色：${presetName}。`
        : `${readyLabel}，配色：${presetName}。未上传展示图片，将使用默认画面生成。`;
    }

    if (!$("previewTable")) return;

    if (currentBatch.sourceType === "text") {
      const row = currentRows[0] || {};
      $("previewTable").className = "mobile-card data-preview-card";
      $("previewTable").innerHTML = `
        <div class="text-summary">
          <div>
            <span>已整理</span>
            <strong>${escapeHtml(row.projectName || "按提交文案生成")}</strong>
          </div>
          ${renderTextSummaryFields(row)}
        </div>
      `;
      return;
    }

    const rows = currentRows.slice(0, 12).map((row, index) => {
      const image = matchImage(row, index);
      return `
        <tr>
          <td>${escapeHtml(row.serial)}</td>
          <td><strong>${escapeHtml(row.projectName || "按提交文案生成")}</strong><br><span class="trace">${escapeHtml(row.location)}</span></td>
          <td>${escapeHtml(row.tag)}</td>
          <td>${escapeHtml(row.monthlyRentAmount)}</td>
          <td>${image ? escapeHtml(image.name) : "默认画面"}</td>
        </tr>
      `;
    }).join("");
    $("previewTable").className = "mobile-card data-preview-card";
    $("previewTable").innerHTML = `
      <table class="data-table">
        <thead><tr><th>序号</th><th>项目</th><th>标签</th><th>月租金</th><th>图片</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderTextSummaryFields(row) {
    const fields = [
      ["面积", row.monthlyRentArea],
      ["租金", row.rentQuote],
      ["用电", row.powerSupply],
      ["区位", row.location],
      ["配套", row.environmentDescription],
      ["联系人", row.contactName],
      ["联系电话", row.contactPhone]
    ].filter(([, value]) => String(value || "").trim());
    if (!fields.length) {
      return `<p class="raw-summary">已读取提交文案，生成时将交给 AI 设计成项目推荐卡。</p>`;
    }
    return `
      <dl>
        ${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    `;
  }

  function matchImage(row, index) {
    if (!currentImages.length) return null;
    if (row.imageFileName) {
      const normalized = row.imageFileName.toLowerCase();
      const direct = currentImages.find((img) => img.name.toLowerCase() === normalized || img.name.toLowerCase().includes(normalized));
      if (direct) return direct;
    }
    return currentImages[0] || null;
  }

  async function generateCards() {
    const user = currentUser();
    const company = currentCompany();
    if (!user || !company) return toast("请先登录。", "bad");
    if (!hasGenerationSession()) return toast("请从官网会员中心进入工具后再生成。", "bad");
    if (!currentBatch || currentBatch.errors.length) return toast("当前项目资料未就绪。", "bad");
    const entitlement = checkEntitlement(company, currentRows.length);
    if (!entitlement.ok) return toast(entitlement.message, "bad");

    $("generateBtn").disabled = true;
    currentGenerated = [];
    const batchShort = Math.random().toString(36).slice(2, 7).toUpperCase();
    const job = {
      id: uid("job"),
      companyId: company.id,
      createdByUserId: user.id,
      importBatchId: currentBatch.id,
      status: "rendering",
      cardCount: currentRows.length,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    state.jobs.push(job);
    renderResultProgress(0, currentRows.length, "准备生成招商推荐卡");

    try {
      for (let i = 0; i < currentRows.length; i += 1) {
        const row = currentRows[i];
        const traceCode = `PC-${todayCode()}-${batchShort}-${String(i + 1).padStart(3, "0")}`;
        const image = matchImage(row, i);
        const payload = {
          ...row,
          ...batchVisualFields(currentBatch, row),
          traceCode,
          companyName: company.name,
          theme: row.theme || normalizeTheme(row.tag),
          backgroundImage: image ? image.dataUrl : null
        };
        const status = createGenerationStatus(i, currentRows.length);
        let generated;
        try {
          status.update(`正在生成第 ${i + 1} 张，配色：${payload.visualPresetName || "精致"}`);
          generated = await generateProjectCardImage(payload);
        } finally {
          status.stop();
        }
        const dataUrl = generated.imageUrl;
        const { backgroundImage, ...payloadSnapshot } = payload;
        const card = {
          id: uid("card"),
          companyId: company.id,
          createdByUserId: user.id,
          jobId: job.id,
          importBatchId: currentBatch.id,
          sourceRowIndex: row.rowIndex,
          projectName: row.projectName,
          traceCode,
          templateId: "project-recommendation-v1",
          templateVersion: "0.2.0",
          renderPayloadJson: {
            ...payloadSnapshot,
            hadBackgroundImage: !!backgroundImage,
            imageUrl: generated.imageUrl,
            metaStored: !!generated.metaStored
          },
          imageStored: true,
          status: "rendered",
          createdAt: new Date().toISOString()
        };
        await putImage(card.id, dataUrl);
        state.cards.push(card);
        currentGenerated.push({ ...card, imageDataUrl: dataUrl });
        renderResultProgress(i + 1, currentRows.length, `${row.projectName || "项目"} 已生成`);
        await sleep(20);
      }
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      confirmUsage(company, user, job);
      saveState();
      renderResultGrid();
      renderQuota();
      renderHistory();
      toast("推荐卡生成完成。", "ok");
    } catch (error) {
      console.error(error);
      job.status = "failed";
      job.errorMessage = error.message || "生成失败";
      saveState();
      renderGenerationFailure(job.errorMessage);
      toast(`生成失败：${job.errorMessage}`, "bad");
    } finally {
      $("generateBtn").disabled = false;
    }
  }

  async function regenerateCurrentCard() {
    const user = currentUser();
    const company = currentCompany();
    if (!user || !company) return toast("请先登录。", "bad");
    if (!hasGenerationSession()) return toast("请从官网会员中心进入工具后再重生成。", "bad");
    const active = currentGenerated[currentPreviewIndex];
    if (!active) return toast("还没有可重生成的推荐卡。", "warn");

    const sourceCard = state.cards.find((card) => card.id === active.id) || active;
    const sourceRow = currentRows.find((row) => row.rowIndex === sourceCard.sourceRowIndex) || currentRows[currentPreviewIndex] || {};
    const storedPayload = sourceCard.renderPayloadJson || {};
    const {
      hadBackgroundImage,
      imageApiModel,
          prompt,
          imageUrl,
          metaUrl,
          metaStored,
          backgroundImage,
          ...cleanPayload
    } = storedPayload;
    const batchShort = String(sourceCard.importBatchId || sourceCard.jobId || uid("batch"))
      .replace(/[^a-z0-9]/gi, "")
      .slice(-5)
      .toUpperCase() || "CARD";
    const traceCode = `PC-${todayCode()}-${batchShort}-R${Date.now().toString(36).slice(-3).toUpperCase()}`;
    const image = sourceRow.projectName ? matchImage(sourceRow, currentPreviewIndex) : null;
    const payload = {
      ...cleanPayload,
      ...(sourceRow.projectName ? sourceRow : {}),
      ...batchVisualFields(currentBatch, { ...cleanPayload, ...sourceRow }),
      projectName: cleanPayload.projectName || sourceCard.projectName || sourceRow.projectName,
      traceCode,
      companyName: company.name,
      theme: cleanPayload.theme || sourceRow.theme || normalizeTheme(sourceRow.tag || cleanPayload.tag),
      backgroundImage: image ? image.dataUrl : null
    };

    $("regenerateBtn").disabled = true;
    const status = createGenerationStatus(0, 1);
    try {
      status.update(`正在重生成当前推荐卡，配色：${payload.visualPresetName || "精致"}`);
      const generated = await generateProjectCardImage(payload);
      const dataUrl = generated.imageUrl;
      const { backgroundImage: nextBackgroundImage, ...payloadSnapshot } = payload;
      const updatedCard = {
        ...sourceCard,
        projectName: payload.projectName,
        traceCode,
        templateId: "project-recommendation-v1",
        templateVersion: "0.2.0",
        renderPayloadJson: {
          ...payloadSnapshot,
          hadBackgroundImage: !!nextBackgroundImage,
          imageUrl: generated.imageUrl,
          metaStored: !!generated.metaStored
        },
        status: "rendered",
        updatedAt: new Date().toISOString()
      };
      await putImage(updatedCard.id, dataUrl);
      const stateIndex = state.cards.findIndex((card) => card.id === updatedCard.id);
      if (stateIndex >= 0) state.cards[stateIndex] = updatedCard;
      else state.cards.push(updatedCard);
      currentGenerated[currentPreviewIndex] = { ...updatedCard, imageDataUrl: dataUrl };
      saveState();
      renderResultGrid();
      renderHistory();
      toast("当前推荐卡已重生成。", "ok");
    } catch (error) {
      console.error(error);
      renderGenerationFailure(error.message || "重生成失败，资料已保留。");
      toast(`重生成失败：${error.message || "接口暂不可用"}`, "bad");
    } finally {
      status.stop();
      $("regenerateBtn").disabled = false;
    }
  }

  function checkEntitlement(company, rowCount) {
    if (company.status !== "active") return { ok: false, message: "公司已停用。" };
    if (rowCount > 30) return { ok: false, message: "轻量版每次最多生成 30 张，请拆分资料。" };
    if (company.planType === "time_unlimited") {
      const validUntil = new Date(`${company.validUntil}T23:59:59`);
      if (Date.now() > validUntil.getTime()) return { ok: false, message: "公司有效期已过。" };
      return { ok: true };
    }
    if ((company.creditsRemaining || 0) < 1) return { ok: false, message: "公司剩余生成次数不足。" };
    return { ok: true };
  }

  function confirmUsage(company, user, job) {
    if (company.planType === "credits") company.creditsRemaining = Math.max(0, (company.creditsRemaining || 0) - 1);
    state.usageLogs.push({
      id: uid("usage"),
      companyId: company.id,
      userId: user.id,
      jobId: job.id,
      planType: company.planType,
      amount: company.planType === "credits" ? 1 : 0,
      cardCount: job.cardCount,
      status: "confirmed",
      createdAt: new Date().toISOString()
    });
  }

  async function generateProjectCardImage(payload) {
    const response = await fetch("/api/generate-card", {
      method: "POST",
      headers: buildApiHeaders(),
      body: JSON.stringify({ payload, traceCode: payload.traceCode, context: buildGenerationContext() })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      if (response.status === 401) {
        state.sessionToken = "";
        saveState();
        throw new Error(result.error || "登录状态已过期，请从官网会员中心重新进入工具。");
      }
      if (response.status === 404 || response.status === 405) {
        throw new Error("生成服务未启动，请联系管理员。");
      }
      throw new Error(result.error || `真实生图接口调用失败：HTTP ${response.status}`);
    }
    if (!result.imageUrl) {
      throw new Error("真实生图接口未返回图片地址。");
    }
    return result;
  }

  function buildGenerationContext() {
    const user = currentUser();
    const company = currentCompany();
    return {
      user: user ? {
        id: user.id,
        externalCustomerId: user.externalCustomerId || "",
        name: user.name || "",
        email: user.phone || "",
        authSource: user.authSource || ""
      } : null,
      company: company ? {
        id: company.id,
        name: company.name || "",
        planType: company.planType || "",
        validUntil: company.validUntil || ""
      } : null
    };
  }

  function buildApiHeaders() {
    const headers = { "Content-Type": "application/json" };
    const user = currentUser();
    const token = (user && user.sessionToken) || state.sessionToken || "";
    if (token) headers["X-Project-Card-Session"] = token;
    return headers;
  }

  function getToolSessionToken() {
    const user = currentUser();
    return (user && user.sessionToken) || state.sessionToken || "";
  }

  function hasToolSessionToken() {
    return Boolean(getToolSessionToken());
  }

  function renderResultProgress(done, total, message = "") {
    $("resultGrid").className = "preview-stage";
    $("resultGrid").innerHTML = `
      <div class="progress-state">
        <span class="progress-spinner" aria-hidden="true"></span>
        <strong>正在生成 ${done}/${total} 张招商推荐卡</strong>
        ${message ? `<span>${escapeHtml(message)}</span>` : ""}
      </div>
    `;
  }

  function createGenerationStatus(done, total) {
    const timers = [];
    const set = (message) => renderResultProgress(done, total, message);
    set("正在连接生图服务");
    timers.push(setTimeout(() => set("正在生成招商卡，请勿关闭页面"), 1200));
    timers.push(setTimeout(() => set("图片生成较慢，系统仍在处理"), 30000));
    timers.push(setTimeout(() => set("仍在生成中，完成后会自动展示结果"), 90000));
    return {
      update(message) {
        set(message);
      },
      stop() {
        timers.forEach((timer) => clearTimeout(timer));
      }
    };
  }

  function renderGenerationFailure(message) {
    $("resultGrid").className = "preview-stage empty";
    $("resultGrid").innerHTML = `
      <article class="empty-preview failure-preview">
        <div class="empty-preview-frame">
          <div class="empty-preview-line strong"></div>
          <div class="empty-preview-line"></div>
          <div class="empty-preview-line short"></div>
        </div>
        <strong>本次没有生成成功</strong>
        <span>${escapeHtml(message || "资料已保留，可以稍后重新点击生成。")}</span>
      </article>
    `;
  }

  function renderResultGrid() {
    if (!currentGenerated.length) {
      renderEmptyPreview();
      return;
    }
    currentPreviewIndex = Math.min(currentPreviewIndex, currentGenerated.length - 1);
    const active = currentGenerated[currentPreviewIndex] || currentGenerated[0];
    $("resultGrid").className = "preview-stage";
    $("resultGrid").innerHTML = `
      <article class="card-thumb" data-preview-src="${active.imageDataUrl}" data-preview-name="${escapeHtml(active.projectName || "项目推荐卡")}">
        <img src="${active.imageDataUrl}" alt="${escapeHtml(active.projectName || "项目推荐卡")}">
        <div class="card-thumb-body">
          <div class="card-thumb-title">${escapeHtml(active.projectName || "项目推荐卡")}</div>
          <div class="trace">${escapeHtml(active.traceCode)}</div>
        </div>
      </article>
      ${currentGenerated.length > 1 ? `
        <div class="preview-strip">
          ${currentGenerated.map((card, index) => `<img src="${card.imageDataUrl}" alt="${escapeHtml(card.projectName)}" data-preview-index="${index}">`).join("")}
        </div>
      ` : ""}
    `;
    document.querySelectorAll("[data-preview-index]").forEach((img) => {
      img.addEventListener("click", () => {
        currentPreviewIndex = Number(img.dataset.previewIndex || 0);
        renderResultGrid();
      });
    });
  }

  function renderEmptyPreview() {
    $("resultGrid").className = "preview-stage empty";
    $("resultGrid").innerHTML = `
      <article class="empty-preview">
        <div class="empty-preview-frame">
          <div class="empty-preview-line strong"></div>
          <div class="empty-preview-line"></div>
          <div class="empty-preview-block"></div>
          <div class="empty-preview-row"></div>
          <div class="empty-preview-row short"></div>
        </div>
        <div class="empty-preview-copy">
          <strong>等待生成招商推荐卡</strong>
          <span>粘贴并整理项目资料后，点击开始生成，结果会显示在这里。</span>
        </div>
      </article>
    `;
  }

  function movePreview(direction) {
    if (!currentGenerated.length) {
      toast("还没有生成结果。", "warn");
      return;
    }
    const total = currentGenerated.length;
    currentPreviewIndex = (currentPreviewIndex + direction + total) % total;
    renderResultGrid();
  }

  function activePreview() {
    if (currentGenerated.length) {
      const card = currentGenerated[currentPreviewIndex] || currentGenerated[0];
      return { src: card.imageDataUrl, name: card.projectName || "项目推荐卡" };
    }
    return null;
  }

  function zoomPreview() {
    const preview = activePreview();
    if (!preview) return toast("还没有可放大的生成结果。", "warn");
    window.open(preview.src, "_blank", "noopener,noreferrer");
  }

  async function exportCurrentPreview() {
    const preview = activePreview();
    if (!preview) return toast("还没有可导出的生成结果。", "warn");
    if (preview.src.startsWith("data:")) {
      downloadUrl(preview.src, `${safeFileName(preview.name)}.png`);
      return;
    }
    const response = await fetch(preview.src);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `${safeFileName(preview.name)}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function drawProjectCard(payload) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    const theme = themes[payload.theme] || themes.teal;

    drawBackground(ctx);
    await drawHeroImage(ctx, payload.backgroundImage, theme);

    ctx.fillStyle = theme.deep;
    ctx.textAlign = "center";
    ctx.font = "900 42px Microsoft YaHei, sans-serif";
    ctx.fillText("项目推荐卡", 540, 72);
    drawTitle(ctx, payload.projectName, theme.deep);
    drawTag(ctx, payload.tag || theme.name, theme);

    drawInfoPanel(ctx, payload, theme);
    drawPriceBand(ctx, payload, theme);
    drawEnvironment(ctx, payload, theme);
    drawReason(ctx, payload, theme);

    return canvas.toDataURL("image/png", 0.94);
  }

  function drawBackground(ctx) {
    const grd = ctx.createLinearGradient(0, 0, 1080, 1350);
    grd.addColorStop(0, "#d9ebfb");
    grd.addColorStop(0.5, "#f7fbff");
    grd.addColorStop(1, "#dbeaf7");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(210, 0);
    ctx.lineTo(0, 170);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,76,140,.08)";
    for (let x = 18; x < 140; x += 24) {
      for (let y = 24; y < 170; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  async function drawHeroImage(ctx, dataUrl, theme) {
    const x = 430;
    const y = 78;
    const w = 620;
    const h = 305;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (dataUrl) {
      const img = await loadImage(dataUrl);
      drawCoverImage(ctx, img, x, y, w, h);
    } else {
      drawSkyline(ctx, x, y, w, h, theme);
    }
    const fade = ctx.createLinearGradient(x, y, x, y + h);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(1, "rgba(255,255,255,.88)");
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawCoverImage(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawSkyline(ctx, x, y, w, h, theme) {
    const grd = ctx.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, "#b9ddfa");
    grd.addColorStop(1, "#f6fbff");
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 7; i += 1) {
      const bw = 58 + i * 8;
      const bh = 120 + (i % 3) * 42;
      const bx = x + 40 + i * 80;
      const by = y + h - bh - 22;
      ctx.fillStyle = i % 2 ? "#dce8f2" : "#c8dbe9";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = theme.deep;
      ctx.globalAlpha = .3;
      for (let wy = by + 18; wy < by + bh; wy += 28) {
        ctx.beginPath();
        ctx.moveTo(bx + 8, wy);
        ctx.lineTo(bx + bw - 8, wy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(ctx, title, color) {
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    const size = title.length > 9 ? 72 : 92;
    ctx.font = `900 ${size}px Microsoft YaHei, sans-serif`;
    const lines = wrapText(ctx, title, 760, 2);
    lines.forEach((line, index) => ctx.fillText(line, 54, 180 + index * (size + 8)));
  }

  function drawTag(ctx, tag, theme) {
    const y = 315;
    ctx.save();
    roundedRect(ctx, 64, y, 450, 74, 34);
    const grd = ctx.createLinearGradient(64, y, 514, y);
    grd.addColorStop(0, theme.accent);
    grd.addColorStop(1, lighten(theme.accent, .25));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "900 38px Microsoft YaHei, sans-serif";
    ctx.fillText(tag, 292, y + 49);
    ctx.restore();
  }

  function drawInfoPanel(ctx, p, theme) {
    roundedRect(ctx, 58, 430, 964, 474, 32);
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.fill();
    ctx.strokeStyle = "#d5e0ec";
    ctx.lineWidth = 2;
    ctx.stroke();

    const items = [
      ["位置", p.location],
      ["项目特点", p.projectFeatures],
      ["广州南站通勤", p.southStationCommute],
      ["石牌桥天河城车程", p.cityDriveTime],
      ["租金报价", p.rentQuote]
    ];
    items.forEach((item, index) => {
      const y = 486 + index * 82;
      if (index) {
        ctx.strokeStyle = "#ccd7e3";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(88, y - 38);
        ctx.lineTo(986, y - 38);
        ctx.stroke();
      }
      ctx.fillStyle = theme.deep;
      ctx.font = "900 30px Microsoft YaHei, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item[0], 150, y);
      ctx.fillStyle = "#202b38";
      ctx.font = index >= 2 ? "900 36px Microsoft YaHei, sans-serif" : "800 28px Microsoft YaHei, sans-serif";
      const valueColor = index >= 2 ? theme.accent : "#202b38";
      ctx.fillStyle = valueColor;
      const lines = wrapText(ctx, item[1] || "", 520, index === 1 ? 2 : 1);
      lines.forEach((line, lineIndex) => ctx.fillText(line, 442, y + lineIndex * 34));
      ctx.strokeStyle = "#8ba1b6";
      ctx.beginPath();
      ctx.moveTo(414, y - 36);
      ctx.lineTo(414, y + 18);
      ctx.stroke();
      drawRoundMark(ctx, 104, y - 18, theme.accent, index);
    });
  }

  function drawRoundMark(ctx, x, y, color, index) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 24px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(["位", "楼", "站", "车", "租"][index], x, y + 8);
  }

  function drawPriceBand(ctx, p, theme) {
    const y = 925;
    roundedRect(ctx, 64, y, 952, 118, 12);
    const grd = ctx.createLinearGradient(64, y, 1016, y);
    grd.addColorStop(0, theme.accent);
    grd.addColorStop(.55, theme.deep);
    grd.addColorStop(1, "#003161");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = "900 34px Microsoft YaHei, sans-serif";
    ctx.fillText(p.monthlyRentArea || "2300㎡月租金", 230, y + 72);
    ctx.strokeStyle = "rgba(255,255,255,.62)";
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(498, y + 25);
    ctx.lineTo(498, y + 93);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.price;
    ctx.font = "900 74px Microsoft YaHei, sans-serif";
    ctx.fillText(formatMoney(p.monthlyRentAmount), 548, y + 83);
    ctx.fillStyle = "#fff";
    ctx.font = "900 34px Microsoft YaHei, sans-serif";
    ctx.fillText("元/月", 892, y + 82);
    ctx.fillStyle = "#fff";
    ctx.font = "900 58px Microsoft YaHei, sans-serif";
    ctx.fillText("楼", 120, y + 78);
  }

  function drawEnvironment(ctx, p, theme) {
    const y = 1062;
    roundedRect(ctx, 64, y, 952, 96, 12);
    ctx.fillStyle = theme.soft;
    ctx.fill();
    ctx.strokeStyle = lighten(theme.accent, .35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.deep;
    ctx.font = "900 30px Microsoft YaHei, sans-serif";
    ctx.fillText("环境描述", 162, y + 58);
    ctx.strokeStyle = lighten(theme.accent, .2);
    ctx.beginPath();
    ctx.moveTo(414, y + 26);
    ctx.lineTo(414, y + 72);
    ctx.stroke();
    ctx.fillStyle = "#28313b";
    ctx.font = "800 26px Microsoft YaHei, sans-serif";
    const lines = wrapText(ctx, p.environmentDescription || "", 520, 2);
    lines.forEach((line, index) => ctx.fillText(line, 458, y + 44 + index * 32));
  }

  function drawReason(ctx, p, theme) {
    const y = 1200;
    roundedRect(ctx, 44, y, 992, 108, 10);
    const grd = ctx.createLinearGradient(44, y, 1036, y);
    grd.addColorStop(0, theme.deep);
    grd.addColorStop(1, "#005aa6");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = "900 32px Microsoft YaHei, sans-serif";
    ctx.fillText("推荐理由：", 174, y + 42);
    ctx.font = "800 27px Microsoft YaHei, sans-serif";
    const lines = wrapText(ctx, p.recommendationReason || "", 720, 2);
    lines.forEach((line, index) => ctx.fillText(line, 174, y + 78 + index * 31));
    ctx.fillStyle = "#f8df95";
    ctx.font = "900 64px Microsoft YaHei, sans-serif";
    ctx.fillText("荐", 82, y + 74);
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    const chars = String(text || "").split("");
    const lines = [];
    let line = "";
    chars.forEach((ch) => {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      let last = clipped[maxLines - 1];
      while (ctx.measureText(`${last}...`).width > maxWidth && last.length) last = last.slice(0, -1);
      clipped[maxLines - 1] = `${last}...`;
      return clipped;
    }
    return lines;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function lighten(hex, amount) {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.round(Math.min(255, ((n >> 16) & 255) + 255 * amount));
    const g = Math.round(Math.min(255, ((n >> 8) & 255) + 255 * amount));
    const b = Math.round(Math.min(255, (n & 255) + 255 * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function formatMoney(value) {
    const raw = String(value || "").replace(/[元,/月\s]/g, "");
    const num = Number(raw);
    if (Number.isFinite(num) && raw) return num.toLocaleString("zh-CN");
    return String(value || "");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function renderHistory() {
    if (!$("historyList")) return;
    const user = currentUser();
    if (!user) {
      renderSampleHistory();
      return;
    }
    const jobs = state.jobs.filter((j) => j.createdByUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!jobs.length) {
      renderArchivedHistoryLoading();
      void loadArchivedHistory();
      return;
    }
    $("historyList").innerHTML = jobs.map((job) => {
      const batch = state.batches.find((b) => b.id === job.importBatchId);
      const cards = state.cards.filter((c) => c.jobId === job.id);
      return `
        <article class="history-item">
          <div>
            <strong>${escapeHtml(batch ? batch.sourceFileName : "未知记录")}</strong>
            <div class="history-meta">
              ${formatDate(job.createdAt)}，状态：${escapeHtml(job.status)}，生成 ${cards.length} 张<br>
              ${cards.slice(0, 3).map((c) => escapeHtml(c.traceCode)).join(" / ")}
            </div>
          </div>
          <div class="action-row">
            <button class="link-btn" data-history-job="${job.id}">载入结果</button>
          </div>
        </article>
      `;
    }).join("");
    document.querySelectorAll("[data-history-job]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const cards = state.cards.filter((c) => c.jobId === btn.dataset.historyJob);
        currentGenerated = await hydrateCards(cards);
        renderResultGrid();
        $("workspaceView").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    void loadArchivedHistory({ append: true });
  }

  function renderArchivedHistoryLoading() {
    $("historyList").className = "gallery-grid";
    $("historyList").innerHTML = `
      <article class="history-item">
        <div>
          <strong>正在读取服务端归档</strong>
          <div class="history-meta">如果你换过设备或清理过浏览器，本地记录会从生成码归档中恢复。</div>
        </div>
      </article>
    `;
  }

  async function loadArchivedHistory(options = {}) {
    if (!$("historyList") || !currentUser()) return;
    if (!hasToolSessionToken()) {
      if (!options.append) renderSampleHistory();
      return;
    }
    try {
      const archive = await fetchMyArchivedCards();
      if (!archive.cards.length && !options.append) {
        renderSampleHistory();
        return;
      }
      renderArchivedHistory(archive.cards, options);
    } catch (error) {
      if (!options.append) {
        $("historyList").className = "gallery-grid";
        $("historyList").innerHTML = `
          <article class="history-item">
            <div>
              <strong>暂无生成记录</strong>
              <div class="history-meta">${escapeHtml(error.message || "服务端归档暂不可用。")}</div>
            </div>
          </article>
        `;
      }
    }
  }

  async function fetchMyArchivedCards() {
    const response = await fetch("/api/my-cards", {
      method: "POST",
      headers: buildApiHeaders(),
      body: JSON.stringify({ context: buildGenerationContext(), limit: 30 })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "读取服务端归档失败。");
    return result;
  }

  function renderArchivedHistory(cards, options = {}) {
    const localTraceCodes = new Set(state.cards.map((card) => card.traceCode));
    const archived = cards.filter((card) => !localTraceCodes.has(card.traceCode));
    if (!archived.length && options.append) return;
    const html = archived.map((card) => `
      <article class="history-item archived-history">
        <div>
          <strong>${escapeHtml(card.projectName || "项目推荐卡")}</strong>
          <div class="history-meta">
            ${formatDate(card.createdAt)}，服务端归档<br>
            ${escapeHtml(card.traceCode)}
          </div>
        </div>
        <div class="action-row">
          <a class="link-btn" href="${escapeHtml(card.imageUrl)}" target="_blank" rel="noopener noreferrer">打开图片</a>
        </div>
      </article>
    `).join("");
    if (options.append) {
      $("historyList").insertAdjacentHTML("beforeend", html);
    } else {
      $("historyList").className = "gallery-grid";
      $("historyList").innerHTML = html || `
        <article class="history-item">
          <div>
            <strong>暂无生成记录</strong>
            <div class="history-meta">完成一次生成后，这里会显示历史推荐卡。</div>
          </div>
        </article>
      `;
    }
  }

  function renderSampleHistory() {
    $("historyList").className = "gallery-grid";
    $("historyList").innerHTML = sampleCards.map((card) => `
      <article class="gallery-card">
        <img src="${card.src}" alt="${escapeHtml(card.name)}项目推荐卡案例">
        <div>
          <span><strong>${escapeHtml(card.name)}</strong><em>${escapeHtml(card.tag)}</em></span>
        </div>
      </article>
    `).join("");
  }

  function renderAdmin() {
    if (!appConfig.adminEnabled) {
      $("adminPanel").innerHTML = `
        <section class="panel" style="max-width:520px">
          <div class="panel-head">
            <h1>管理入口</h1>
            <p>第一版公开试用不开放工具内管理台。公司权益和会员入口合并到官网会员系统，生成码溯源后续迁移到服务端管理员鉴权。</p>
          </div>
          <div class="notice muted">当前只保留客户生成链路和“我的生成”记录。</div>
        </section>
      `;
      return;
    }

    $("adminPanel").innerHTML = `
      <div class="admin-grid">
        <section class="panel">
          <div class="panel-head">
            <h1>公司权益</h1>
            <p>创建公司后，把公司码或邀请链接发给客户员工。</p>
          </div>
          <div class="stack">
            <label class="field"><span>公司名</span><input id="companyName" placeholder="例如：广州某某产业园"></label>
            <label class="field"><span>权益类型</span>
              <select id="planType">
                <option value="time_unlimited">30 天内免费使用</option>
                <option value="credits">生成次数</option>
              </select>
            </label>
            <label class="field"><span>次数</span><input id="credits" type="number" value="10"></label>
            <label class="field"><span>有效期至</span><input id="validUntil" type="date" value="${addDays(new Date(), 30).toISOString().slice(0, 10)}"></label>
            <button id="createCompanyBtn" class="primary">创建公司</button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head row-between">
            <div>
              <h1>生成码溯源</h1>
              <p>输入生成记录里的生成码，反查公司、员工、生成记录和来源位置。</p>
            </div>
            <button id="resetDemoBtn" class="danger-btn">清空本地数据</button>
          </div>
          <div class="action-row">
            <input id="traceSearch" style="flex:1;min-height:42px;border:1px solid var(--line);border-radius:8px;padding:9px 10px" placeholder="例如 PC-260725-ABCDE-001">
            <button id="traceBtn" class="secondary">查询</button>
          </div>
          <div id="traceResult" class="notice muted">等待查询。</div>
          <div id="companyTable" style="margin-top:16px"></div>
        </section>
      </div>
    `;
    $("createCompanyBtn").addEventListener("click", createCompany);
    $("traceBtn").addEventListener("click", traceCode);
    $("resetDemoBtn").addEventListener("click", resetDemo);
    renderCompanyTable();
  }

  function createCompany() {
    const name = $("companyName").value.trim();
    if (!name) return toast("请填写公司名。", "bad");
    const planType = $("planType").value;
    const inviteCode = `CMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    state.companies.push({
      id: uid("company"),
      name,
      inviteCode,
      planType,
      creditsRemaining: Number($("credits").value || 0),
      validUntil: $("validUntil").value || addDays(new Date(), 30).toISOString().slice(0, 10),
      status: "active",
      createdAt: new Date().toISOString()
    });
    saveState();
    renderAdmin();
    toast(`公司已创建，公司码 ${inviteCode}`, "ok");
  }

  function renderCompanyTable() {
    const rows = state.companies.map((c) => {
      const users = state.users.filter((u) => u.companyId === c.id);
      const jobs = state.jobs.filter((j) => j.companyId === c.id);
      return `
        <tr>
          <td><strong>${escapeHtml(c.name)}</strong><br><span class="trace">${escapeHtml(c.id)}</span></td>
          <td>${escapeHtml(c.inviteCode)}</td>
          <td>${c.planType === "time_unlimited" ? `有效期至 ${c.validUntil}` : `剩余 ${c.creditsRemaining} 次`}</td>
          <td>${users.length}</td>
          <td>${jobs.length}</td>
        </tr>
      `;
    }).join("");
    $("companyTable").innerHTML = `
      <table class="data-table">
        <thead><tr><th>公司</th><th>公司码</th><th>权益</th><th>员工</th><th>记录</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async function traceCode() {
    const code = $("traceSearch").value.trim();
    if (!code) {
      $("traceResult").className = "notice bad";
      $("traceResult").textContent = "请输入生成码。";
      return;
    }
    const card = state.cards.find((c) => c.traceCode === code);
    if (!card) {
      $("traceResult").className = "notice muted";
      $("traceResult").textContent = "本地记录未找到，正在查询服务端归档...";
      try {
        const archived = await fetchTraceCard(code);
        renderServerTraceResult(archived.card);
      } catch (error) {
        $("traceResult").className = "notice bad";
        $("traceResult").textContent = error.message || "未找到该生成码。";
      }
      return;
    }
    const company = state.companies.find((c) => c.id === card.companyId);
    const user = state.users.find((u) => u.id === card.createdByUserId);
    const batch = state.batches.find((b) => b.id === card.importBatchId);
    $("traceResult").className = "notice ok";
    $("traceResult").innerHTML = `
      公司：${escapeHtml(company ? company.name : "未知")}<br>
      员工：${escapeHtml(user ? user.name : "未知")}<br>
      项目：${escapeHtml(card.projectName)}<br>
      来源：${escapeHtml(batch ? batch.sourceFileName : "未知")}，位置 ${card.sourceRowIndex}<br>
      模板：${escapeHtml(card.templateId)} ${escapeHtml(card.templateVersion)}<br>
      生成时间：${formatDate(card.createdAt)}
    `;
  }

  async function fetchTraceCard(code) {
    const response = await fetch(`/api/trace-card?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "未找到该生成码。");
    return result;
  }

  function renderServerTraceResult(card) {
    const context = card.context || {};
    const user = context.user || {};
    const company = context.company || {};
    const payload = card.payload || {};
    $("traceResult").className = "notice ok";
    $("traceResult").innerHTML = `
      公司：${escapeHtml(company.name || "未记录")}<br>
      员工：${escapeHtml(user.name || user.email || "未记录")}<br>
      项目：${escapeHtml(card.projectName || payload.projectName || "按提交文案生成")}<br>
      生成时间：${formatDate(card.createdAt)}<br>
      图片：<a href="${escapeHtml(card.imageUrl)}" target="_blank" rel="noopener noreferrer">打开推荐卡</a>
    `;
  }

  function resetDemo() {
    if (!confirm("确定清空本地 MVP 数据吗？")) return;
    localStorage.removeItem(STORAGE_KEY);
    clearImages();
    state = loadState();
    currentRows = [];
    currentImages = [];
    currentBatch = null;
    currentGenerated = [];
    if (appConfig.demoSessionEnabled) ensureSeedCompany();
    renderAll();
    renderPreview();
    renderResultGrid();
  }

  function openImageDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IMAGE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putImage(id, dataUrl) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE, "readwrite");
      tx.objectStore(IMAGE_STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getImage(id) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE, "readonly");
      const request = tx.objectStore(IMAGE_STORE).get(id);
      request.onsuccess = () => resolve(request.result || "");
      request.onerror = () => reject(request.error);
    });
  }

  async function hydrateCard(card) {
    if (!card) return null;
    if (card.imageDataUrl) return card;
    return { ...card, imageDataUrl: await getImage(card.id) };
  }

  async function hydrateCards(cards) {
    return Promise.all(cards.map(hydrateCard));
  }

  function clearImages() {
    const request = indexedDB.deleteDatabase(IMAGE_DB);
    request.onerror = () => console.warn("IndexedDB 清理失败", request.error);
  }

  function downloadTemplate() {
    const headers = ["序号", "项目名", "位置", "项目特点", "广州南站通勤", "石牌桥天河城车程", "租金报价", "2300㎡月租金", "环境描述", "推荐理由", "推荐标签", "图片文件名", "主题"];
    const sample = ["1", "莱茵科技园", "陈村", "广州7号线陈村北站上盖", "10分钟", "约42分钟，27公里", "21+3=24元（含租金、物业费、发票）", "55200", "迷你产业园，科技研发生产办公", "地铁上盖，通勤效率高，适合科技研发生产办公布局。", "地铁通勤优选", "laiyin.jpg", "teal"];
    const csv = `${headers.join(",")}\n${sample.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")}`;
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "项目推荐卡模板.csv");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadUrl(url, fileName) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function compressImageFile(file) {
    const source = await readAsDataUrl(file);
    if (!String(file.type || "").startsWith("image/")) return source;
    const img = await loadImage(source);
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeFileName(value) {
    return String(value || "project").replace(/[\\/:*?"<>|]/g, "_").slice(0, 48);
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  }

  function toast(message, kind) {
    const box = $("validationBox");
    if (!box) return alert(message);
    box.className = `notice ${kind || "muted"}`;
    box.textContent = message;
  }
})();
