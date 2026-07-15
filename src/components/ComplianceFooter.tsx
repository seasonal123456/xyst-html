"use client";

import { useEffect, useState } from "react";

type ComplianceInfo = {
  success: boolean;
  icpRecordNumber?: string;
  icpRecordUrl?: string;
  policeRecordNumber?: string;
  policeRecordUrl?: string;
};

export function ComplianceFooter() {
  const [info, setInfo] = useState<ComplianceInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/site-compliance", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ComplianceInfo | null) => {
        if (active) setInfo(data);
      })
      .catch(() => {
        if (active) setInfo(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const icpRecordNumber = info?.icpRecordNumber?.trim();
  const policeRecordNumber = info?.policeRecordNumber?.trim();

  return (
    <footer className="border-t border-slate-200 bg-white/88 px-5 py-4 text-center text-xs font-semibold text-slate-500">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span>佛山市新颖数投网络科技有限公司</span>
        <span>售后联系：微信 season452190241</span>
        {icpRecordNumber ? (
          <a
            href={info?.icpRecordUrl || "https://beian.miit.gov.cn/"}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-blue-600"
          >
            {icpRecordNumber}
          </a>
        ) : null}
        {policeRecordNumber ? (
          <a
            href={info?.policeRecordUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-blue-600"
          >
            {policeRecordNumber}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
