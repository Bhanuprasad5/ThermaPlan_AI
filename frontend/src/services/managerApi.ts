import apiClient from './apiClient';
import { SchedulePlanResponse, ExtractedConstraintJSON, CitationItem } from '../types/backend';

export async function getMorningPlan(): Promise<SchedulePlanResponse> {
  const { data } = await apiClient.get<SchedulePlanResponse>('/manager/morning-plan');
  return data;
}

export async function getActivePlan(): Promise<SchedulePlanResponse> {
  const { data } = await apiClient.get<SchedulePlanResponse>('/manager/active-plan');
  return data;
}

export async function parseRules(
  csvFile: File | null,
  pdfFile: File | null,
  naturalLanguageRule: string
): Promise<ExtractedConstraintJSON> {
  const form = new FormData();
  if (csvFile) form.append('csv_file', csvFile);
  if (pdfFile) form.append('pdf_file', pdfFile);
  form.append('natural_language_rule', naturalLanguageRule);

  const { data } = await apiClient.post<ExtractedConstraintJSON>(
    '/manager/parse-rules',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function approveAndSolve(constraints?: any): Promise<SchedulePlanResponse> {
  const { data } = await apiClient.post<SchedulePlanResponse>(
    '/manager/approve-and-solve',
    constraints || {}
  );
  return data;
}

export async function solve48h(horizonHours = 48, slotDurationMinutes = 15): Promise<SchedulePlanResponse> {
  const { data } = await apiClient.post<SchedulePlanResponse>('/manager/solve-48h', {
    horizon_hours: horizonHours,
    slot_duration_minutes: slotDurationMinutes,
    enforce_heat_safety: true,
    enforce_tariff_optimization: true,
  });
  return data;
}

export async function getCitations(planId: string): Promise<CitationItem[]> {
  try {
    const { data } = await apiClient.get<CitationItem[]>(`/manager/citations/${planId}`);
    return data;
  } catch {
    return [];
  }
}
