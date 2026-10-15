import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "./spec-authoring.cases.js";

describeSkill("spec-authoring", () => runSkillCases("spec-authoring", cases));
