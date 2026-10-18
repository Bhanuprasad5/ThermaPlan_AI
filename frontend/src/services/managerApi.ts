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

export async function solve48h(
  horizonHours = 48,
  slotDurationMinutes = 15,
  ordersCsv?: string,
  dayId?: string
): Promise<SchedulePlanResponse> {
  const { data } = await apiClient.post<SchedulePlanResponse>('/manager/solve-48h', {
    horizon_hours: horizonHours,
    slot_duration_minutes: slotDurationMinutes,
    enforce_heat_safety: true,
    enforce_tariff_optimization: true,
    orders_csv: ordersCsv || undefined,
    day_id: dayId || undefined,
  });
  return data;
}

export async function listAvailableTemplates(): Promise<{
  templates: Array<{ day_id: string; label: string; orders_filename: string; roster_filename: string; tariff_filename: string; available: boolean }>;
  note: string;
}> {
  const { data } = await apiClient.get('/manager/available-templates');
  return data;
}

export async function loadAvailableTemplate(dayId: string): Promise<{
  day_id: string;
  label: string;
  source: string;
  orders_filename: string;
  orders_csv: string;
  roster_filename: string;
  roster_csv: string;
  tariff_filename: string;
  tariff_csv: string;
  pdf_included: boolean;
}> {
  const { data } = await apiClient.get(`/manager/available-templates/${dayId}`);
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
