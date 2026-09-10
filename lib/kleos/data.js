import { supabase } from "@/lib/supabase/client";
import { BIG_FIVE_SELECT_COLUMNS } from "@/lib/kleos/bigFive";

export const AUTHORIZED_KLEOS_EMAIL = "theneolorenzo@gmail.com";

export function createEmptyKleosData() {
  return {
    strengthMetrics: [],
    cognitiveTests: [],
    bigFiveAssessments: [],
    academicStages: [],
    academicModules: [],
    academicNotes: "",
    strengthProfile: {
      bodyWeightKg: "",
      bodyWeightMeasuredOn: "",
      heightCm: ""
    },
    healthProfile: {
      bloodTestText: "",
      miscText: ""
    },
    cvText: "",
    immutableText: "",
    miscText: ""
  };
}

export async function loadKleosData(userId) {
  if (!supabase || !userId) {
    throw new Error("Kleos is unavailable without an authenticated cloud session.");
  }

  const [
    strengthMetricsResult,
    cognitiveTestsResult,
    bigFiveAssessmentsResult,
    academicStagesResult,
    academicModulesResult,
    academicNotesResult,
    strengthProfileResult,
    healthResult,
    cvResult,
    immutableResult,
    miscResult
  ] = await Promise.all([
    supabase
      .from("heracles_strength_metrics")
      .select("source_exercise_id,exercise_name,equipment_name,best_1rm,body_weight_kg_at_achieved,body_weight_kind,best_1rm_relative_bw,qualifying_sessions,achieved_on,estimation_basis,is_current,synced_at,last_checked_at,source")
      .eq("user_id", userId)
      .order("is_current", { ascending: false })
      .order("exercise_name", { ascending: true }),
    supabase
      .from("goat_cognitive_tests")
      .select("id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at")
      .eq("user_id", userId)
      .order("taken_at", { ascending: false }),
    supabase
      .from("goat_big_five_assessments")
      .select(BIG_FIVE_SELECT_COLUMNS)
      .eq("user_id", userId)
      .order("test_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("goat_academic_stage_results")
      .select("id,academic_year,stage,exam_board,stage_mean,weighting,credits,stage_result")
      .eq("user_id", userId)
      .order("academic_year", { ascending: false }),
    supabase
      .from("goat_academic_module_results")
      .select("id,academic_year,stage,module_name,module_code,term,attempt,assessed_by,mark,result,credits")
      .eq("user_id", userId)
      .order("academic_year", { ascending: false })
      .order("module_name", { ascending: true }),
    supabase
      .from("goat_academic_notes")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_strength_profile")
      .select("body_weight_kg,body_weight_measured_on,height_cm")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_health_characteristics")
      .select("blood_test_content,misc_content,content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_cv_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_immutable_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_misc_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  const firstError = [
    strengthMetricsResult.error,
    cognitiveTestsResult.error,
    bigFiveAssessmentsResult.error,
    academicStagesResult.error,
    academicModulesResult.error,
    academicNotesResult.error,
    strengthProfileResult.error,
    healthResult.error,
    cvResult.error,
    immutableResult.error,
    miscResult.error
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  return {
    strengthMetrics: strengthMetricsResult.data || [],
    cognitiveTests: cognitiveTestsResult.data || [],
    bigFiveAssessments: bigFiveAssessmentsResult.data || [],
    academicStages: academicStagesResult.data || [],
    academicModules: academicModulesResult.data || [],
    academicNotes: academicNotesResult.data?.content || "",
    strengthProfile: {
      bodyWeightKg: strengthProfileResult.data?.body_weight_kg ?? "",
      bodyWeightMeasuredOn: strengthProfileResult.data?.body_weight_measured_on ?? "",
      heightCm: strengthProfileResult.data?.height_cm ?? ""
    },
    healthProfile: {
      bloodTestText: healthResult.data?.blood_test_content || "",
      miscText: healthResult.data?.misc_content || healthResult.data?.content || ""
    },
    cvText: cvResult.data?.content || "",
    immutableText: immutableResult.data?.content || "",
    miscText: miscResult.data?.content || ""
  };
}
