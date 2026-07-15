const navItems = [
  ["流程", "#flow"],
  ["包含", "#price"],
  ["价格", "#price"]
];

const keynoteStats = [
  ["约 20 分钟", "生成官网初稿"],
  ["399 元/次", "制作官网"],
  ["赠送部署", "3 个月上线服务"]
];

const flowSteps = [
  ["01", "准备资料", "提供文案、展示图片、服务范围和联系信息。"],
  ["02", "生成初稿", "AI 拓展设计为官网首页与完整静态页面。"],
  ["03", "确认交付包", "下载完整官网文件，图片资源一并打包。"],
  ["04", "赠送部署", "免费提供 3 个月轻量化上线服务，生成公开访问链接。"]
];

const includedItems = [
  "官网最终稿",
  "完整静态交付包",
  "完整前端代码",
  "图片资源本地化",
  "电脑 / 手机自适应",
  "3 个月轻量化上线服务"
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-950">
      <section className="relative min-h-[820px] border-b border-slate-200 bg-white md:min-h-[860px]">
        <img
          src="/brand/xinyingst-launch-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.96)_0%,rgba(255,255,255,.88)_34%,rgba(255,255,255,.28)_72%,rgba(255,255,255,.12)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,rgba(247,249,252,0),#f7f9fc)]" />

        <header className="relative z-10 mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 py-5">
          <a href="/" className="flex items-center gap-3 font-black text-slate-950">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-sm text-white">新</span>
            <span>新颖数投</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-bold text-slate-600 md:flex">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="transition hover:text-sky-600">
                {label}
              </a>
            ))}
          </nav>
          <a href="/login?next=/site/start" className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-700">
            登录
          </a>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[720px] max-w-7xl items-center px-5 pb-20 pt-10 md:min-h-[760px]">
          <div className="max-w-3xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white/80 px-3 py-2 text-xs font-black text-sky-700 shadow-sm">
              AI 官网制作与赠送部署
            </p>
            <h1 className="text-6xl font-black leading-[.98] text-slate-950 md:text-8xl">
              新颖数投
            </h1>
            <p className="mt-7 max-w-[21rem] text-2xl font-black leading-tight text-slate-900 sm:max-w-2xl md:text-4xl">
              <span className="block">让官网设计</span>
              <span className="block">真正随你流转</span>
            </p>
            <p className="mt-6 max-w-[21rem] text-base font-semibold leading-8 text-slate-600 sm:max-w-2xl md:text-lg">
              <span className="block">只需准备文案和展示图片，即可快速拓展设计为可下载、可浏览、可部署的官网。</span>
              <span className="block">399 元/次制作，赠送轻量化上线服务。</span>
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="/site/start" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-[0_18px_44px_rgba(15,23,42,.22)] transition hover:-translate-y-1 hover:bg-sky-700">
                开始生成官网 <ArrowIcon />
              </a>
              <a href="#price" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-6 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-sky-300 hover:text-sky-700">
                查看服务内容
              </a>
            </div>
            <div className="mt-12 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
              {keynoteStats.map(([value, label]) => (
                <div key={value} className="rounded-lg border border-white bg-white/72 p-3 shadow-[0_20px_50px_rgba(15,23,42,.08)] backdrop-blur sm:p-4">
                  <div className="text-lg font-black leading-tight text-slate-950 sm:text-xl">{value}</div>
                  <div className="mt-1 text-[11px] font-bold leading-snug text-slate-500 sm:text-xs">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="flow" className="bg-white px-5 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
            <div>
              <p className="text-sm font-black text-sky-600">FLOW</p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-slate-950 md:text-6xl">
                <span className="block">从资料到</span>
                <span className="block">公开链接，</span>
                <span className="block">流程更短，</span>
                <span className="block">结果更稳。</span>
              </h2>
            </div>
            <p className="max-w-2xl text-base font-semibold leading-8 text-slate-600">
              只需准备文案和展示图片，即可快速拓展设计为可部署官网。交付包确认后，系统生成公开链接并同步后台记录。
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {flowSteps.map(([no, title, desc]) => (
              <article key={no} className="rounded-lg border border-slate-200 bg-[#f8fbff] p-6">
                <div className="text-4xl font-black text-slate-300">{no}</div>
                <h3 className="mt-8 text-lg font-black text-slate-950">{title}</h3>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="price" className="bg-white px-5 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f2f7ff)] p-8 shadow-[0_28px_90px_rgba(15,23,42,.08)] md:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_.85fr] lg:items-center">
              <div>
                <p className="text-sm font-black text-sky-600">ONE PRICE</p>
                <h2 className="mt-4 text-4xl font-black leading-tight text-slate-950 md:text-6xl">
                  <span className="block">399 元/次，</span>
                  <span className="block">官网制作</span>
                  <span className="block">和轻量化部署</span>
                  <span className="block">一次完成。</span>
                </h2>
                <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-slate-600">
                  客户先拿到完整官网交付包，并赠送 3 个月网站上线服务（详见部署说明）。适合 MVP 测试、临时展示和快速获客验证。
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {includedItems.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-lg bg-white/80 p-4 text-sm font-black text-slate-700 shadow-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-50 text-sky-700">
                        <CheckIcon />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,.08)]">
                <div className="text-sm font-black text-slate-500">官网制作 + 轻量化部署服务</div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-6xl font-black text-slate-950">399</span>
                  <span className="pb-2 text-lg font-black text-slate-500">元 / 次</span>
                </div>
                <p className="mt-5 text-sm font-semibold leading-7 text-slate-600">
                  包含可下载官网包、完整前端代码、公开链接生成、后台记录同步和基础可访问性检查。
                </p>
                <a href="/site/start" className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:-translate-y-1 hover:bg-sky-700">
                  生成我的官网 <ArrowIcon />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-5 py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-slate-200 pt-8 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
          <div className="font-black text-slate-950">新颖数投</div>
          <div>AI 官网生成、交付包与轻量化部署服务</div>
        </div>
      </footer>
    </main>
  );
}
