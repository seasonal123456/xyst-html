"use client";

import type { RequirementFormValues } from "@/types";

type RequirementFormProps = {
  values: RequirementFormValues;
  onChange: (patch: Partial<RequirementFormValues>) => void;
};

const inputClass =
  "mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100";

export function RequirementForm({ values, onChange }: RequirementFormProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">基础信息</h2>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">客户姓名</span>
            <input
              className={inputClass}
              value={values.customerName}
              onChange={(event) => onChange({ customerName: event.target.value })}
              placeholder="方便管理员回访"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">客户手机 / 微信</span>
            <input
              className={inputClass}
              value={values.customerContact}
              onChange={(event) => onChange({ customerContact: event.target.value })}
              placeholder="手机号 / 微信号"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">企业 / 项目名称 *</span>
          <input
            className={inputClass}
            value={values.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例如：万洋众创城"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">所属行业</span>
            <input
              className={inputClass}
              value={values.industry}
              onChange={(event) => onChange({ industry: event.target.value })}
              placeholder="例如：产业园 / 制造业 / 企业服务"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">主营产品 / 服务</span>
            <input
              className={inputClass}
              value={values.business}
              onChange={(event) => onChange({ business: event.target.value })}
              placeholder="例如：厂房招商、生产配套、企业服务"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">目标客户</span>
          <input
            className={inputClass}
            value={values.targetCustomer}
            onChange={(event) => onChange({ targetCustomer: event.target.value })}
            placeholder="例如：中小制造企业、扩产企业、外贸工厂"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">核心卖点</span>
          <textarea
            className={`${inputClass} min-h-32`}
            value={values.sellingPoints}
            onChange={(event) => onChange({ sellingPoints: event.target.value })}
            placeholder={"一行写一个卖点\n例如：层高充足，适合轻生产\n交通便利，靠近高速入口\n可注册、可环评、可分割"}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">联系方式</span>
            <input
              className={inputClass}
              value={values.contact}
              onChange={(event) => onChange({ contact: event.target.value })}
              placeholder="电话 / 微信 / 地址"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">补充说明</span>
            <input
              className={inputClass}
              value={values.note}
              onChange={(event) => onChange({ note: event.target.value })}
              placeholder="可填写限制、偏好或额外信息"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">期望用途</span>
          <input
            className={inputClass}
            value={values.usagePurpose}
            onChange={(event) => onChange({ usagePurpose: event.target.value })}
            placeholder="例如：朋友圈招商转发、公众号封面、客户方案初稿"
          />
        </label>

        <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={values.needManualRefine}
            onChange={(event) => onChange({ needManualRefine: event.target.checked })}
            className="mt-1 h-4 w-4 accent-teal-700"
          />
          <span>
            <span className="block text-sm font-bold text-slate-800">是否需要人工精修</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">勾选后任务会进入待人工审核，便于管理员后续处理。</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-3">
          <input
            type="checkbox"
            checked={values.materialConsent}
            onChange={(event) => onChange({ materialConsent: event.target.checked })}
            className="mt-1 h-4 w-4 accent-teal-700"
          />
          <span className="text-sm font-bold leading-6 text-teal-900">
            我确认上传的素材可用于本次宣传图生成测试，并理解当前为小规模试用版本。
          </span>
        </label>
      </div>
    </section>
  );
}
