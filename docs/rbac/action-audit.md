# RBAC Action Coverage Audit

_Generated: 2026-08-27T18:52:49.651Z_

**Total action sites scanned:** 2040
**Protected:** 1518
**Coverage:** 74.4%

Any row with **Protected = No** must be wrapped in `<PermissionGate module="..." action="...">` or replaced with `<GuardedButton module="..." action="...">` — or, if intentionally public (login, cancel, close, back, …), added to the allow-list in `scripts/rbac-audit.ts`.

## By category

| Category | Total | Protected | Coverage |
|---|---:|---:|---:|
| Action | 1238 | 921 | 74% |
| Create | 223 | 167 | 75% |
| View | 137 | 137 | 100% |
| Save | 116 | 75 | 65% |
| Edit | 44 | 22 | 50% |
| Close | 38 | 32 | 84% |
| Export | 30 | 21 | 70% |
| Submit | 29 | 16 | 55% |
| Approve | 25 | 19 | 76% |
| Download | 19 | 16 | 84% |
| Delete | 18 | 12 | 67% |
| Reject | 16 | 9 | 56% |
| Workflow | 15 | 11 | 73% |
| Assign | 14 | 4 | 29% |
| Issue | 13 | 8 | 62% |
| Import | 11 | 11 | 100% |
| Reopen | 11 | 6 | 55% |
| Upload | 11 | 11 | 100% |
| Report | 10 | 7 | 70% |
| Print | 7 | 5 | 71% |
| Configure | 5 | 4 | 80% |
| Email | 3 | 1 | 33% |
| Publish | 3 | 2 | 67% |
| Archive | 2 | 0 | 0% |
| Status Change | 1 | 0 | 0% |
| Bulk | 1 | 1 | 100% |

## Detail

| Page | Button | Permission | Protected | File | Line |
|---|---|---|---|---|---:|
| components/admin/classification/AuthorizationSchemesTab | Enable | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 95 |
| components/admin/classification/AuthorizationSchemesTab | Disable | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 101 |
| components/admin/classification/AuthorizationSchemesTab | Retire | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 107 |
| components/admin/classification/AuthorizationSchemesTab | History | — | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 112 |
| components/admin/classification/AuthorizationSchemesTab | Add scheme | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 142 |
| components/admin/classification/AuthorizationSchemesTab | Edit | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 168 |
| components/admin/classification/AuthorizationSchemesTab | Add class | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 177 |
| components/admin/classification/AuthorizationSchemesTab | Edit | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 200 |
| components/admin/classification/AuthorizationSchemesTab | Cancel | — | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 254 |
| components/admin/classification/AuthorizationSchemesTab | Save | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 255 |
| components/admin/classification/AuthorizationSchemesTab | Cancel | — | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 309 |
| components/admin/classification/AuthorizationSchemesTab | Save | — | No | src/components/admin/classification/AuthorizationSchemesTab.tsx | 310 |
| components/admin/classification/ClassificationStructureTab | Enable | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 124 |
| components/admin/classification/ClassificationStructureTab | Disable | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 130 |
| components/admin/classification/ClassificationStructureTab | Retire | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 136 |
| components/admin/classification/ClassificationStructureTab | History | — | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 141 |
| components/admin/classification/ClassificationStructureTab | Delete draft | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 145 |
| components/admin/classification/ClassificationStructureTab | Edit | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 173 |
| components/admin/classification/ClassificationStructureTab | Add local sector | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 195 |
| components/admin/classification/ClassificationStructureTab | Edit | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 236 |
| components/admin/classification/ClassificationStructureTab | Add business type | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 244 |
| components/admin/classification/ClassificationStructureTab | Cancel | — | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 298 |
| components/admin/classification/ClassificationStructureTab | Save | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 299 |
| components/admin/classification/ClassificationStructureTab | Cancel | — | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 361 |
| components/admin/classification/ClassificationStructureTab | Save | — | No | src/components/admin/classification/ClassificationStructureTab.tsx | 362 |
| components/admin/classification/StatusChangeDialog | Cancel | — | Yes | src/components/admin/classification/StatusChangeDialog.tsx | 140 |
| components/admin/classification/StatusChangeDialog | Confirm | — | Yes | src/components/admin/classification/StatusChangeDialog.tsx | 141 |
| components/admin/MasterDataImportDialog | Download Sample Excel | settings.export | Yes | src/components/admin/MasterDataImportDialog.tsx | 232 |
| components/admin/MasterDataImportDialog | Choose Excel File | settings.import | Yes | src/components/admin/MasterDataImportDialog.tsx | 235 |
| components/admin/MasterDataImportDialog | Cancel | master_data_management.import | Yes | src/components/admin/MasterDataImportDialog.tsx | 291 |
| components/admin/MasterDataImportDialog | {importing ? 'Importing...' : `Import $ row(s)`} | master_data_management.import | Yes | src/components/admin/MasterDataImportDialog.tsx | 292 |
| components/admin/MasterDataItemsImportDialog | Download Sample Excel | settings.export | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 162 |
| components/admin/MasterDataItemsImportDialog | Choose Excel File | settings.import | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 165 |
| components/admin/MasterDataItemsImportDialog | Cancel | master_data_management.import | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 223 |
| components/admin/MasterDataItemsImportDialog | {importing ? 'Importing...' : `Import $ row(s)`} | master_data_management.import | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 224 |
| components/admin/operating-structure/AccessStatusNote | Review access | — | No | src/components/admin/operating-structure/AccessStatusNote.tsx | 21 |
| components/admin/operating-structure/EntitySupervisionTab | Assign supervision | — | No | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 228 |
| components/admin/operating-structure/EntitySupervisionTab | Assign | — | No | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 320 |
| components/admin/operating-structure/EntitySupervisionTab | Transfer | — | No | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 388 |
| components/admin/operating-structure/EntitySupervisionTab | End | — | No | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 389 |
| components/admin/operating-structure/EntitySupervisionTab | Cancel | — | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 468 |
| components/admin/operating-structure/EntitySupervisionTab | Transfer supervision | — | No | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 469 |
| components/admin/operating-structure/MandateAdminTab | New mandate | — | No | src/components/admin/operating-structure/MandateAdminTab.tsx | 114 |
| components/admin/operating-structure/MandateAdminTab | Edit | — | No | src/components/admin/operating-structure/MandateAdminTab.tsx | 129 |
| components/admin/operating-structure/MandateAdminTab | Cancel | — | Yes | src/components/admin/operating-structure/MandateAdminTab.tsx | 265 |
| components/admin/operating-structure/OverviewTab | Assign sector lead | — | No | src/components/admin/operating-structure/OverviewTab.tsx | 98 |
| components/admin/operating-structure/OverviewTab | Add staff responsibility | — | No | src/components/admin/operating-structure/OverviewTab.tsx | 99 |
| components/admin/operating-structure/OverviewTab | Manage decision bodies | — | No | src/components/admin/operating-structure/OverviewTab.tsx | 100 |
| components/admin/operating-structure/OverviewTab | Open sector coverage | — | Yes | src/components/admin/operating-structure/OverviewTab.tsx | 122 |
| components/admin/operating-structure/PanelsCommitteesTab | + Add member | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 200 |
| components/admin/operating-structure/PanelsCommitteesTab | Record policy | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 313 |
| components/admin/operating-structure/PanelsCommitteesTab | + Add member | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 366 |
| components/admin/operating-structure/PanelsCommitteesTab | Decision rule | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 373 |
| components/admin/operating-structure/PanelsCommitteesTab | Cancel | — | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 475 |
| components/admin/operating-structure/PanelsCommitteesTab | Save decision rule | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 476 |
| components/admin/operating-structure/PanelsCommitteesTab | Cancel | — | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 559 |
| components/admin/operating-structure/PanelsCommitteesTab | Add member | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 560 |
| components/admin/operating-structure/PanelsCommitteesTab | Remove | — | No | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 590 |
| components/admin/operating-structure/PeopleTab | Manage roles | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 183 |
| components/admin/operating-structure/PeopleTab | Add responsibility | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 196 |
| components/admin/operating-structure/PeopleTab | Edit | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 219 |
| components/admin/operating-structure/PeopleTab | End | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 222 |
| components/admin/operating-structure/PeopleTab | Add unit membership | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 243 |
| components/admin/operating-structure/PeopleTab | Change role | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 256 |
| components/admin/operating-structure/PeopleTab | End | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 257 |
| components/admin/operating-structure/PeopleTab | A sector Full sector responsibility, or selected areas of work within one sector | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 316 |
| components/admin/operating-structure/PeopleTab | Specific work Named sub-sectors or individual entities, across one or more areas | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 326 |
| components/admin/operating-structure/PeopleTab | Cancel | — | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 383 |
| components/admin/operating-structure/PeopleTab | Save | — | No | src/components/admin/operating-structure/PeopleTab.tsx | 384 |
| components/admin/operating-structure/RegulatorsAdminTab | Full regulator management | — | No | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 71 |
| components/admin/operating-structure/RegulatorsAdminTab | Deactivate | — | No | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 90 |
| components/admin/operating-structure/RegulatorsAdminTab | Activate | — | No | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 94 |
| components/admin/operating-structure/ResponsibilityDialog | Cancel | — | Yes | src/components/admin/operating-structure/ResponsibilityDialog.tsx | 456 |
| components/admin/operating-structure/ResponsibilityDialog | Save | — | No | src/components/admin/operating-structure/ResponsibilityDialog.tsx | 457 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | — | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 273 |
| components/admin/operating-structure/SectorAssignDialogs | Assign lead | — | No | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 274 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | — | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 387 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | — | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 503 |
| components/admin/operating-structure/SectorAssignDialogs | Save | — | No | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 504 |
| components/admin/operating-structure/SectorCoverageSheet | + Add supporting staff | — | No | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 77 |
| components/admin/operating-structure/SectorCoverageSheet | Edit | — | No | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 92 |
| components/admin/operating-structure/SectorCoverageSheet | Remove | — | No | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 99 |
| components/admin/operating-structure/SectorCoverageTab | Manage | — | No | src/components/admin/operating-structure/SectorCoverageTab.tsx | 125 |
| components/admin/operating-structure/StaffResponsibilityTab | Edit responsibilities | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 175 |
| components/admin/operating-structure/StaffResponsibilityTab | Add | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 245 |
| components/admin/operating-structure/StaffResponsibilityTab | End | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 263 |
| components/admin/operating-structure/StaffResponsibilityTab | Add responsibility | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 320 |
| components/admin/operating-structure/StaffResponsibilityTab | End | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 338 |
| components/admin/operating-structure/StaffResponsibilityTab | Add | — | No | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 393 |
| components/admin/operating-structure/TeamAdminTab | New team | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 118 |
| components/admin/operating-structure/TeamAdminTab | Edit | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 157 |
| components/admin/operating-structure/TeamAdminTab | Add / update | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 201 |
| components/admin/operating-structure/TeamAdminTab | End | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 242 |
| components/admin/operating-structure/TeamAdminTab | Attach | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 277 |
| components/admin/operating-structure/TeamAdminTab | Detach | — | No | src/components/admin/operating-structure/TeamAdminTab.tsx | 295 |
| components/admin/operating-structure/TeamAdminTab | Cancel | — | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 372 |
| components/admin/rdm/DataIntegrityPanel | Refresh | — | Yes | src/components/admin/rdm/DataIntegrityPanel.tsx | 171 |
| components/admin/rdm/MetadataTablePanel | Add | — | No | src/components/admin/rdm/MetadataTablePanel.tsx | 182 |
| components/admin/rdm/MetadataTablePanel | Cancel | — | Yes | src/components/admin/rdm/MetadataTablePanel.tsx | 305 |
| components/admin/rdm/MetadataTablePanel | Save | — | No | src/components/admin/rdm/MetadataTablePanel.tsx | 306 |
| components/admin/returns-config/DataIntegrityPanel | Re-verify | — | No | src/components/admin/returns-config/DataIntegrityPanel.tsx | 44 |
| components/admin/returns-config/DefinitionFormsDrawer | Assign form | — | No | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 109 |
| components/admin/returns-config/DefinitionFormsDrawer | Cancel | — | Yes | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 149 |
| components/admin/returns-config/DefinitionFormsDrawer | Save | — | No | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 150 |
| components/admin/returns-config/ObligationRulesPanel | New obligation rule | — | No | src/components/admin/returns-config/ObligationRulesPanel.tsx | 120 |
| components/admin/returns-config/ObligationRulesPanel | Test rule | — | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 151 |
| components/admin/returns-config/ObligationRulesPanel | Cancel | — | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 249 |
| components/admin/returns-config/ObligationRulesPanel | Save rule | — | No | src/components/admin/returns-config/ObligationRulesPanel.tsx | 250 |
| components/admin/returns-config/RegulatoryMetricsPanel | New metric | — | No | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 99 |
| components/admin/returns-config/RegulatoryMetricsPanel | Deactivate | — | No | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 129 |
| components/admin/returns-config/RegulatoryMetricsPanel | Cancel | — | Yes | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 241 |
| components/admin/returns-config/RegulatoryMetricsPanel | Save metric | — | No | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 242 |
| components/admin/returns-config/ReturnDefinitionsPanel | New return definition | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 103 |
| components/admin/returns-config/ReturnDefinitionsPanel | Cancel | — | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 223 |
| components/admin/returns-config/ReturnDefinitionsPanel | Save definition | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 224 |
| components/admin/returns-config/ReturnDefinitionsPanel | Edit | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 318 |
| components/admin/returns-config/ReturnDefinitionsPanel | Assigned forms ( ) | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 319 |
| components/admin/returns-config/ReturnDefinitionsPanel | Activate | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 321 |
| components/admin/returns-config/ReturnDefinitionsPanel | Suspend | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 324 |
| components/admin/returns-config/ReturnDefinitionsPanel | Retire… | — | No | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 327 |
| components/admin/rule-engine/ModuleTesterPanel | Run test | rule_engine.test | Yes | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 118 |
| components/admin/rule-engine/ModuleTesterPanel | CSV | — | No | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 124 |
| components/admin/rule-engine/ModuleTesterPanel | JSON | — | No | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 127 |
| components/admin/rule-engine/RuleTesterPanel | Run test | rule_engine.edit | Yes | src/components/admin/rule-engine/RuleTesterPanel.tsx | 171 |
| components/admin/rule-engine/RuleTesterPanel | Export CSV | — | No | src/components/admin/rule-engine/RuleTesterPanel.tsx | 176 |
| components/admin/rule-engine/RuleTesterPanel | Export JSON | — | No | src/components/admin/rule-engine/RuleTesterPanel.tsx | 179 |
| components/ai-reports/EntityCoverageView | Try again | — | Yes | src/components/ai-reports/EntityCoverageView.tsx | 60 |
| components/ai-reports/EntityCoverageView | View report | — | Yes | src/components/ai-reports/EntityCoverageView.tsx | 137 |
| components/ai/AiReportDetailDrawer | Try again | — | Yes | src/components/ai/AiReportDetailDrawer.tsx | 239 |
| components/ai/AiReportDetailDrawer | Try again | — | Yes | src/components/ai/AiReportDetailDrawer.tsx | 355 |
| components/ai/SupervisoryAiPanel | Copy | — | Yes | src/components/ai/SupervisoryAiPanel.tsx | 267 |
| components/analytics/DashboardInsightsCard | Refresh | — | Yes | src/components/analytics/DashboardInsightsCard.tsx | 74 |
| components/appeals/AppealActionsDialog | Acknowledge appeal | — | No | src/components/appeals/AppealActionsDialog.tsx | 179 |
| components/appeals/AppealActionsDialog | Consider appeal | — | No | src/components/appeals/AppealActionsDialog.tsx | 244 |
| components/appeals/AppealActionsDialog | Decline appeal | — | No | src/components/appeals/AppealActionsDialog.tsx | 254 |
| components/appeals/AppealActionsDialog | Reopen application | — | No | src/components/appeals/AppealActionsDialog.tsx | 282 |
| components/appeals/AppealActionsDialog | Close | — | Yes | src/components/appeals/AppealActionsDialog.tsx | 302 |
| components/appeals/AppealPanelMembersDialog | Add member | — | No | src/components/appeals/AppealPanelMembersDialog.tsx | 181 |
| components/appeals/AppealPanelMembersDialog | Make chair | — | No | src/components/appeals/AppealPanelMembersDialog.tsx | 206 |
| components/appeals/AppealPanelMembersDialog | Save member | — | No | src/components/appeals/AppealPanelMembersDialog.tsx | 300 |
| components/appeals/AppealPanelMembersDialog | Cancel | — | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 304 |
| components/appeals/AppealPanelMembersDialog | Close | — | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 311 |
| components/appeals/AppealPanelSection | Refer &amp; constitute panel | — | No | src/components/appeals/AppealPanelSection.tsx | 252 |
| components/appeals/AppealPanelSection | Amend minutes | — | No | src/components/appeals/AppealPanelSection.tsx | 354 |
| components/appeals/AppealPanelSection | Cancel | — | Yes | src/components/appeals/AppealPanelSection.tsx | 384 |
| components/appeals/AppealParticipationPanel | Record participation | — | No | src/components/appeals/AppealParticipationPanel.tsx | 140 |
| components/appeals/AppealParticipationPanel | Declare conflict &amp; recuse | — | No | src/components/appeals/AppealParticipationPanel.tsx | 147 |
| components/appeals/AppealParticipationPanel | Cast vote | — | No | src/components/appeals/AppealParticipationPanel.tsx | 179 |
| components/appeals/InternalUserMultiSelect | {selected.length === 0 ? placeholder : `$ selected`} | — | No | src/components/appeals/InternalUserMultiSelect.tsx | 47 |
| components/appeals/LicenseAppealPanel | Withdraw appeal | — | No | src/components/appeals/LicenseAppealPanel.tsx | 129 |
| components/appeals/LicenseAppealPanel | Lodge an appeal | — | No | src/components/appeals/LicenseAppealPanel.tsx | 150 |
| components/appeals/LodgeAppealDialog | Cancel | — | Yes | src/components/appeals/LodgeAppealDialog.tsx | 91 |
| components/appeals/LodgeAppealDialog | Submit appeal | — | No | src/components/appeals/LodgeAppealDialog.tsx | 92 |
| components/applications/ApplicationAiAssessmentPanel | Regenerate | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 537 |
| components/applications/ApplicationAiAssessmentPanel | Generate assessment | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 569 |
| components/applications/ApplicationAiAssessmentPanel | Retry generation | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 584 |
| components/applications/ApplicationAiAssessmentPanel | Retry generation | — | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 595 |
| components/applications/ApplicationAiAssessmentPanel | Clear decision | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 989 |
| components/applications/ApplicationAiAssessmentPanel | Accept | application_management.approve | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1026 |
| components/applications/ApplicationAiAssessmentPanel | Override | application_management.reject | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1030 |
| components/applications/ApplicationAiAssessmentPanel | Escalate | application_management.escalate | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1034 |
| components/applications/ApplicationAiAssessmentPanel | Cancel | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1063 |
| components/applications/ApplicationAiAssessmentPanel | Save | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1066 |
| components/applications/ApplicationAiAssessmentPanel | Accept AI routing | application_management.approve | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1134 |
| components/applications/ApplicationAiAssessmentPanel | Override with reason | application_management.edit | Yes | src/components/applications/ApplicationAiAssessmentPanel.tsx | 1137 |
| components/applications/ApplicationDocumentsPanel | Retry | — | Yes | src/components/applications/ApplicationDocumentsPanel.tsx | 100 |
| components/applications/ApplicationRfiTab | Close RFI & resume SLA | application_management.close | Yes | src/components/applications/ApplicationRfiTab.tsx | 280 |
| components/applications/ApplicationRfiTab | Submit response | application_management.edit | Yes | src/components/applications/ApplicationRfiTab.tsx | 493 |
| components/applications/ApplicationUploadPanel | Download Sample (Excel) | application_management.import | Yes | src/components/applications/ApplicationUploadPanel.tsx | 141 |
| components/applications/ApplicationUploadPanel | Download Sample (XML) | application_management.import | Yes | src/components/applications/ApplicationUploadPanel.tsx | 144 |
| components/applications/ApplicationUploadPanel | Choose file | application_management.import | Yes | src/components/applications/ApplicationUploadPanel.tsx | 174 |
| components/applications/ApplicationUploadPanel | Remove | application_management.edit | Yes | src/components/applications/ApplicationUploadPanel.tsx | 193 |
| components/applications/ApplicationUploadPanel | Import into application | application_management.import | Yes | src/components/applications/ApplicationUploadPanel.tsx | 208 |
| components/applications/ConfigurableDecisionActions | Cancel | — | Yes | src/components/applications/ConfigurableDecisionActions.tsx | 273 |
| components/applications/ConfigurableDecisionActions | Confirm | — | Yes | src/components/applications/ConfigurableDecisionActions.tsx | 276 |
| components/applications/DecisionDocumentPreview | Print | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 496 |
| components/applications/DecisionDocumentPreview | Download | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 497 |
| components/applications/DecisionDocumentPreview | Copy text | — | Yes | src/components/applications/DecisionDocumentPreview.tsx | 499 |
| components/applications/DecisionDocumentPreview | Print certificate | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 567 |
| components/applications/DecisionDocumentPreview | Download PDF | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 571 |
| components/applications/DecisionDocumentPreview | Record decision letter | application_management.approve | Yes | src/components/applications/DecisionDocumentPreview.tsx | 613 |
| components/applications/DecisionDocumentPreview | Record certificate | application_management.approve | Yes | src/components/applications/DecisionDocumentPreview.tsx | 619 |
| components/applications/FeeComponentsPanel | Add Fee | application_management.create | Yes | src/components/applications/FeeComponentsPanel.tsx | 146 |
| components/applications/FeeComponentsPanel | Cancel | — | Yes | src/components/applications/FeeComponentsPanel.tsx | 183 |
| components/applications/LegalComplianceNotesSection | Save Legal Note | application_management.edit | Yes | src/components/applications/LegalComplianceNotesSection.tsx | 208 |
| components/applications/LegalReferralPanel | Refer for review | — | No | src/components/applications/LegalReferralPanel.tsx | 165 |
| components/applications/LegalReferralPanel | Accept review | — | No | src/components/applications/LegalReferralPanel.tsx | 220 |
| components/applications/LegalReferralPanel | Return opinion to case | — | No | src/components/applications/LegalReferralPanel.tsx | 225 |
| components/applications/LegalReferralPanel | Close referral | — | No | src/components/applications/LegalReferralPanel.tsx | 230 |
| components/applications/LegalReferralPanel | Cancel | — | Yes | src/components/applications/LegalReferralPanel.tsx | 235 |
| components/applications/LegalReferralPanel | Cancel | — | Yes | src/components/applications/LegalReferralPanel.tsx | 286 |
| components/applications/LegalReferralPanel | Raise referral | — | No | src/components/applications/LegalReferralPanel.tsx | 287 |
| components/applications/LegalReferralPanel | Cancel | — | Yes | src/components/applications/LegalReferralPanel.tsx | 308 |
| components/applications/LegalReferralPanel | Close referral | — | No | src/components/applications/LegalReferralPanel.tsx | 309 |
| components/applications/LicenseConditionsPanel | Add condition | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 120 |
| components/applications/LicenseConditionsPanel | Cancel | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 160 |
| components/applications/LicenseConditionsPanel | Add | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 161 |
| components/applications/LicenseePaymentPanel | Download invoice | — | No | src/components/applications/LicenseePaymentPanel.tsx | 256 |
| components/applications/LicenseePaymentPanel | Paid Offline | — | No | src/components/applications/LicenseePaymentPanel.tsx | 349 |
| components/applications/PaymentVerificationDialog | Download invoice | application_management.edit | No | src/components/applications/PaymentVerificationDialog.tsx | 370 |
| components/applications/PaymentVerificationDialog | Reject payment | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 379 |
| components/applications/PaymentVerificationDialog | Verify & issue invoice | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 383 |
| components/applications/PaymentVerificationDialog | Cancel | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 390 |
| components/applications/PaymentVerificationDialog | Received & Verify | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 394 |
| components/applications/PaymentVerificationDialog | Close | — | Yes | src/components/applications/PaymentVerificationDialog.tsx | 400 |
| components/applications/RaiseRfiDialog | Add all | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 305 |
| components/applications/RaiseRfiDialog | Add item | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 351 |
| components/applications/RaiseRfiDialog | Cancel | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 417 |
| components/applications/RaiseRfiDialog | Raise RFI | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 420 |
| components/applications/SubmissionAcknowledgement | Track Application | application_management.view | Yes | src/components/applications/SubmissionAcknowledgement.tsx | 102 |
| components/applications/SubmissionAcknowledgement | Download | application_management.view | Yes | src/components/applications/SubmissionAcknowledgement.tsx | 109 |
| components/applications/SubmissionAcknowledgementPanel | View / Download | — | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 140 |
| components/applications/SubmissionAcknowledgementPanel | View / Download Submission Acknowledgement | — | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 190 |
| components/applications/SubmissionAcknowledgementPanel | Check again | — | No | src/components/applications/SubmissionAcknowledgementPanel.tsx | 199 |
| components/applications/SubmissionAcknowledgementPanel | Generate acknowledgement | — | No | src/components/applications/SubmissionAcknowledgementPanel.tsx | 226 |
| components/applications/SubmissionAcknowledgementPanel | Download acknowledgement (PDF) | — | No | src/components/applications/SubmissionAcknowledgementPanel.tsx | 289 |
| components/applications/SubmissionAcknowledgementPanel | Regenerate document | — | No | src/components/applications/SubmissionAcknowledgementPanel.tsx | 299 |
| components/applications/SufficiencyPanel | Request missing information ( ) | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 301 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 340 |
| components/applications/SufficiencyPanel | Run automated checks | — | No | src/components/applications/SufficiencyPanel.tsx | 348 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 362 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 394 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 409 |
| components/applications/SufficiencyPanel | Request information | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 452 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | No | src/components/applications/SufficiencyPanel.tsx | 462 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 467 |
| components/applications/SufficiencyPanel | View reason | — | Yes | src/components/applications/SufficiencyPanel.tsx | 477 |
| components/applications/SufficiencyPanel | Record sufficiency decision | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 523 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 546 |
| components/applications/SufficiencyPanel | Previous determinations ( ) — history | — | No | src/components/applications/SufficiencyPanel.tsx | 577 |
| components/applications/SufficiencyPanel | Cancel | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 634 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 635 |
| components/applications/SufficiencyPanel | Close | — | Yes | src/components/applications/SufficiencyPanel.tsx | 656 |
| components/applications/SufficiencyPanel | Cancel | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 728 |
| components/applications/SufficiencyPanel | Record decision | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 729 |
| components/applications/TwinPeaksPanel | Cancel | application_management.edit | Yes | src/components/applications/TwinPeaksPanel.tsx | 196 |
| components/applications/TwinPeaksPanel | Save | application_management.edit | Yes | src/components/applications/TwinPeaksPanel.tsx | 197 |
| components/applications/TwinPeaksPanel | Raise | application_management.edit | Yes | src/components/applications/TwinPeaksPanel.tsx | 209 |
| components/applications/TwinPeaksPanel | Resolve | application_management.edit | Yes | src/components/applications/TwinPeaksPanel.tsx | 231 |
| components/applications/WorkflowActionPreviewDialog | Reset to template | application_management.edit | Yes | src/components/applications/WorkflowActionPreviewDialog.tsx | 721 |
| components/applications/WorkflowActionPreviewDialog | Clear | application_management.edit | Yes | src/components/applications/WorkflowActionPreviewDialog.tsx | 761 |
| components/applications/WorkflowActionPreviewDialog | Upload | application_management.edit | Yes | src/components/applications/WorkflowActionPreviewDialog.tsx | 786 |
| components/applications/WorkflowActionPreviewDialog | Cancel | application_management.approve | Yes | src/components/applications/WorkflowActionPreviewDialog.tsx | 827 |
| components/applications/WorkflowActionPreviewDialog | Confirm &amp; Send | application_management.approve | Yes | src/components/applications/WorkflowActionPreviewDialog.tsx | 830 |
| components/applications/WorkflowPanel | Retry | — | Yes | src/components/applications/WorkflowPanel.tsx | 620 |
| components/applications/WorkflowPanel | Add Remark | application_management.create | Yes | src/components/applications/WorkflowPanel.tsx | 1102 |
| components/applications/WorkflowPanel | Copy Password Setup Link | — | Yes | src/components/applications/WorkflowPanel.tsx | 1447 |
| components/audit/ChangeHistoryDrawer | Refresh | — | Yes | src/components/audit/ChangeHistoryDrawer.tsx | 260 |
| components/audit/LineageViewer | Trace lineage | — | No | src/components/audit/LineageViewer.tsx | 92 |
| components/audit/LineageViewer | Load lineage | — | No | src/components/audit/LineageViewer.tsx | 100 |
| components/audit/OverrideJustificationDialog | Cancel | — | Yes | src/components/audit/OverrideJustificationDialog.tsx | 78 |
| components/audit/OverrideReasonDialog | Cancel | — | Yes | src/components/audit/OverrideReasonDialog.tsx | 123 |
| components/audit/ReturnHistoryDrawer | Refresh | — | Yes | src/components/audit/ReturnHistoryDrawer.tsx | 176 |
| components/collab-review/CollaborativeReview | Accept | returns_management.approve | Yes | src/components/collab-review/CollaborativeReview.tsx | 334 |
| components/collab-review/CollaborativeReview | Reject | returns_management.reject | Yes | src/components/collab-review/CollaborativeReview.tsx | 339 |
| components/collab-review/CollaborativeReview | Reply | returns_management.edit | Yes | src/components/collab-review/CollaborativeReview.tsx | 416 |
| components/collab-review/CollaborativeReview | Resolve | returns_management.edit | Yes | src/components/collab-review/CollaborativeReview.tsx | 421 |
| components/collab-review/CollaborativeReview | Reopen | returns_management.edit | Yes | src/components/collab-review/CollaborativeReview.tsx | 426 |
| components/collab-review/CollaborativeReview | Cancel | — | Yes | src/components/collab-review/CollaborativeReview.tsx | 444 |
| components/collab-review/CollaborativeReview | Reply | — | Yes | src/components/collab-review/CollaborativeReview.tsx | 445 |
| components/collab-review/CollaborativeReview | Add comment | returns_management.edit | Yes | src/components/collab-review/CollaborativeReview.tsx | 516 |
| components/collab-review/CollaborativeReview | Suggest | returns_management.edit | Yes | src/components/collab-review/CollaborativeReview.tsx | 553 |
| components/collab-review/CollaborativeReview | View comments | — | Yes | src/components/collab-review/CollaborativeReview.tsx | 576 |
| components/collab-review/CollabReviewConfigTab | Copy permissions to this step | — | Yes | src/components/collab-review/CollabReviewConfigTab.tsx | 284 |
| components/collab-review/CollabReviewConfigTab | Grant defaults | application_management.edit | Yes | src/components/collab-review/CollabReviewConfigTab.tsx | 338 |
| components/collab-review/CollabReviewConfigTab | Revoke | application_management.edit | Yes | src/components/collab-review/CollabReviewConfigTab.tsx | 339 |
| components/complaints/ClosureQaPanel | Go to Current step | — | Yes | src/components/complaints/ClosureQaPanel.tsx | 314 |
| components/complaints/ClosureQaPanel | Issue outcome letter | — | No | src/components/complaints/ClosureQaPanel.tsx | 387 |
| components/complaints/ClosureQaPanel | Retry | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 398 |
| components/complaints/ClosureQaPanel | Retry | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 405 |
| components/complaints/ClosureQaPanel | Review Current step | — | No | src/components/complaints/ClosureQaPanel.tsx | 424 |
| components/complaints/ClosureQaPanel | Cancel | — | Yes | src/components/complaints/ClosureQaPanel.tsx | 511 |
| components/complaints/ClosureQaPanel | Issue letter | — | No | src/components/complaints/ClosureQaPanel.tsx | 514 |
| components/complaints/ComplaintAcknowledgement | Close | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 224 |
| components/complaints/ComplaintAcknowledgement | Print / Save as PDF | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 227 |
| components/complaints/ComplaintAcknowledgement | Close | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 308 |
| components/complaints/ComplaintAcknowledgement | Print / Save as PDF | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 311 |
| components/complaints/ComplaintCurrentStepPanel | Open | — | Yes | src/components/complaints/ComplaintCurrentStepPanel.tsx | 215 |
| components/complaints/ComplaintEntityCard | Change linked entity | complaint_management.edit | Yes | src/components/complaints/ComplaintEntityCard.tsx | 233 |
| components/complaints/ComplaintEntityCard | Link a licensed entity instead | complaint_management.edit | Yes | src/components/complaints/ComplaintEntityCard.tsx | 260 |
| components/complaints/ComplaintEvidenceRow | Reprint acknowledgement | complaint_management.edit | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 71 |
| components/complaints/ComplaintEvidenceRow | Retry auto-triage | complaint_management.edit | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 72 |
| components/complaints/ComplaintEvidenceRow | Open full detail & history | — | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 73 |
| components/complaints/ComplaintInvestigationTab | Open jurisdiction | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 138 |
| components/complaints/ComplaintInvestigationTab | Open triage | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 139 |
| components/complaints/ComplaintInvestigationTab | Open the investigation | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 157 |
| components/complaints/ComplaintInvestigationTab | Add note | complaint_management.edit | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 208 |
| components/complaints/ComplaintInvestigationTab | Correspondence on this case ( ) | — | No | src/components/complaints/ComplaintInvestigationTab.tsx | 251 |
| components/complaints/ComplaintOverviewSummary | Go to current step | — | Yes | src/components/complaints/ComplaintOverviewSummary.tsx | 132 |
| components/complaints/ComplaintPhasePanel | Open jurisdiction assessment | — | Yes | src/components/complaints/ComplaintPhasePanel.tsx | 69 |
| components/complaints/ComplaintPhasePanel | Go there | — | No | src/components/complaints/ComplaintPhasePanel.tsx | 121 |
| components/complaints/ComplaintRfiTab | Raise information request | complaint_management.edit | Yes | src/components/complaints/ComplaintRfiTab.tsx | 123 |
| components/complaints/ComplaintRfiTab | Return question | complaint_management.edit | Yes | src/components/complaints/ComplaintRfiTab.tsx | 229 |
| components/complaints/ComplaintRfiTab | Close request | complaint_management.edit | Yes | src/components/complaints/ComplaintRfiTab.tsx | 257 |
| components/complaints/ComplaintRfiTab | Cancel request | complaint_management.edit | Yes | src/components/complaints/ComplaintRfiTab.tsx | 260 |
| components/complaints/ComplaintTrackingView | Cancel | — | Yes | src/components/complaints/ComplaintTrackingView.tsx | 211 |
| components/complaints/ComplaintTrackingView | Track a different complaint | — | Yes | src/components/complaints/ComplaintTrackingView.tsx | 236 |
| components/complaints/ComplaintTrackingView | Retry | — | Yes | src/components/complaints/ComplaintTrackingView.tsx | 253 |
| components/complaints/ConductClassificationCard | Auto-triage | complaint_management.edit | Yes | src/components/complaints/ConductClassificationCard.tsx | 185 |
| components/complaints/DataState | Retry | — | Yes | src/components/complaints/DataState.tsx | 62 |
| components/complaints/duplicates/ClusterGroupsPanel | Retry | — | Yes | src/components/complaints/duplicates/ClusterGroupsPanel.tsx | 52 |
| components/complaints/duplicates/ClusterGroupsPanel | View complaints | — | Yes | src/components/complaints/duplicates/ClusterGroupsPanel.tsx | 68 |
| components/complaints/duplicates/DetectionRulesPanel | Save changes | complaint_management.edit | Yes | src/components/complaints/duplicates/DetectionRulesPanel.tsx | 65 |
| components/complaints/duplicates/DuplicateAlertBanner | Retry | — | Yes | src/components/complaints/duplicates/DuplicateAlertBanner.tsx | 54 |
| components/complaints/duplicates/DuplicatePairDrawer | Dismiss | complaint_management.edit | Yes | src/components/complaints/duplicates/DuplicatePairDrawer.tsx | 65 |
| components/complaints/duplicates/DuplicatePairDrawer | Link | complaint_management.edit | Yes | src/components/complaints/duplicates/DuplicatePairDrawer.tsx | 68 |
| components/complaints/duplicates/DuplicatePairDrawer | Merge into Primary | complaint_management.edit | Yes | src/components/complaints/duplicates/DuplicatePairDrawer.tsx | 71 |
| components/complaints/duplicates/SuspectedDuplicatesTable | Compare | complaint_management.edit | Yes | src/components/complaints/duplicates/SuspectedDuplicatesTable.tsx | 89 |
| components/complaints/escalations/EscalationBanner | Retry | — | Yes | src/components/complaints/escalations/EscalationBanner.tsx | 51 |
| components/complaints/investigation/AllegationsRegister | Record allegation | complaint_management.investigate | Yes | src/components/complaints/investigation/AllegationsRegister.tsx | 160 |
| components/complaints/investigation/AllegationsRegister | Save scope | complaint_management.investigate | Yes | src/components/complaints/investigation/AllegationsRegister.tsx | 291 |
| components/complaints/investigation/AllegationsRegister | Record assessment | complaint_management.investigate | Yes | src/components/complaints/investigation/AllegationsRegister.tsx | 339 |
| components/complaints/investigation/AllegationsRegister | Reopen allegation | complaint_management.investigate | Yes | src/components/complaints/investigation/AllegationsRegister.tsx | 359 |
| components/complaints/investigation/EvidenceWorkspace | Register evidence | complaint_management.investigate | Yes | src/components/complaints/investigation/EvidenceWorkspace.tsx | 165 |
| components/complaints/investigation/EvidenceWorkspace | Save assessment | complaint_management.investigate | Yes | src/components/complaints/investigation/EvidenceWorkspace.tsx | 302 |
| components/complaints/investigation/EvidenceWorkspace | Link evidence | complaint_management.investigate | Yes | src/components/complaints/investigation/EvidenceWorkspace.tsx | 331 |
| components/complaints/investigation/EvidenceWorkspace | Unlink A | complaint_management.investigate | Yes | src/components/complaints/investigation/EvidenceWorkspace.tsx | 346 |
| components/complaints/investigation/EvidenceWorkspace | Withdraw evidence | complaint_management.investigate | Yes | src/components/complaints/investigation/EvidenceWorkspace.tsx | 372 |
| components/complaints/investigation/InvestigationPlanPanel | Jurisdiction | complaint_management.investigate | No | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 104 |
| components/complaints/investigation/InvestigationPlanPanel | Triage | complaint_management.investigate | No | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 107 |
| components/complaints/investigation/InvestigationPlanPanel | Open the investigation | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 113 |
| components/complaints/investigation/InvestigationPlanPanel | Save plan | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 185 |
| components/complaints/investigation/InvestigationPlanPanel | Submit for approval | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 195 |
| components/complaints/investigation/InvestigationPlanPanel | Approve plan | complaint_management.approve | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 206 |
| components/complaints/investigation/InvestigationPlanPanel | Create a revision | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 228 |
| components/complaints/investigation/InvestigationReadinessPanel | Open information requests | — | Yes | src/components/complaints/investigation/InvestigationReadinessPanel.tsx | 75 |
| components/complaints/investigation/InvestigationReadinessPanel | Go to closure &amp; QA | — | Yes | src/components/complaints/investigation/InvestigationReadinessPanel.tsx | 80 |
| components/complaints/investigation/InvestigationRfiLinkPanel | Open information requests | — | Yes | src/components/complaints/investigation/InvestigationRfiLinkPanel.tsx | 44 |
| components/complaints/investigation/InvestigationTasksPanel | Add work item | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 129 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as being worked on | — | No | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 198 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as done | — | No | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 207 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as blocked | — | No | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 226 |
| components/complaints/investigation/InvestigationTasksPanel | No longer required | — | No | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 245 |
| components/complaints/investigation/InvestigationTasksPanel | Reopen | — | No | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 254 |
| components/complaints/investigation/RepresentationsPanel | Open the window | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 121 |
| components/complaints/investigation/RepresentationsPanel | Mark under review | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 181 |
| components/complaints/investigation/RepresentationsPanel | Accept for consideration | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 189 |
| components/complaints/investigation/RepresentationsPanel | Extend deadline | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 211 |
| components/complaints/investigation/RepresentationsPanel | Close window | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 263 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Start assessment | complaint_management.assess_jurisdiction | No | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 337 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Save | complaint_management.assess_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 428 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record information request | complaint_management.assess_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 491 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record decision | complaint_management.decide_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 616 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Reopen assessment | complaint_management.reopen_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 686 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record response | — | No | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 718 |
| components/complaints/LicenseePicker | Retry | — | Yes | src/components/complaints/LicenseePicker.tsx | 211 |
| components/complaints/outcome/ClosureGatePanel | Go to outcome | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 114 |
| components/complaints/outcome/ClosureGatePanel | Go to redress | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 115 |
| components/complaints/outcome/ClosureGatePanel | Issue outcome letter | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 116 |
| components/complaints/outcome/ClosureGatePanel | Re-check | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 117 |
| components/complaints/outcome/ClosureGatePanel | Send for quality review | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 159 |
| components/complaints/outcome/ClosureGatePanel | Pass review | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 162 |
| components/complaints/outcome/ClosureGatePanel | Return for correction | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 165 |
| components/complaints/outcome/ClosureGatePanel | Approve and close | — | No | src/components/complaints/outcome/ClosureGatePanel.tsx | 188 |
| components/complaints/outcome/ClosureGatePanel | Cancel | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 257 |
| components/complaints/outcome/ClosureGatePanel | Confirm | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 258 |
| components/complaints/outcome/OutcomeReviewPanel | Go to redress | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 211 |
| components/complaints/outcome/OutcomeReviewPanel | Go to closure &amp; quality review | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 212 |
| components/complaints/outcome/OutcomeReviewPanel | Open redress | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 269 |
| components/complaints/outcome/OutcomeReviewPanel | Save draft | — | No | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 308 |
| components/complaints/outcome/OutcomeReviewPanel | Complete outcome review | — | No | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 312 |
| components/complaints/outcome/ReconsiderationPanel | Record a request | — | No | src/components/complaints/outcome/ReconsiderationPanel.tsx | 115 |
| components/complaints/outcome/ReconsiderationPanel | Decide admissibility | — | No | src/components/complaints/outcome/ReconsiderationPanel.tsx | 169 |
| components/complaints/outcome/ReconsiderationPanel | Record review decision | — | No | src/components/complaints/outcome/ReconsiderationPanel.tsx | 181 |
| components/complaints/outcome/ReconsiderationPanel | Cancel | — | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 233 |
| components/complaints/outcome/ReconsiderationPanel | Record request | — | No | src/components/complaints/outcome/ReconsiderationPanel.tsx | 234 |
| components/complaints/outcome/ReconsiderationPanel | Cancel | — | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 303 |
| components/complaints/outcome/ReconsiderationPanel | Confirm | — | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 304 |
| components/complaints/outcome/RedressPanel | Add redress | — | No | src/components/complaints/outcome/RedressPanel.tsx | 139 |
| components/complaints/outcome/RedressPanel | Edit | — | No | src/components/complaints/outcome/RedressPanel.tsx | 187 |
| components/complaints/outcome/RedressPanel | Mark completed | — | No | src/components/complaints/outcome/RedressPanel.tsx | 204 |
| components/complaints/outcome/RedressPanel | Verify | — | No | src/components/complaints/outcome/RedressPanel.tsx | 208 |
| components/complaints/outcome/RedressPanel | Cancel | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 212 |
| components/complaints/outcome/RedressPanel | Cancel | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 300 |
| components/complaints/outcome/RedressPanel | Save | — | No | src/components/complaints/outcome/RedressPanel.tsx | 301 |
| components/complaints/outcome/RedressPanel | Close | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 328 |
| components/complaints/outcome/RedressPanel | Confirm | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 329 |
| components/complaints/public-intake/PublicComplaintWizard | Track this complaint | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 297 |
| components/complaints/public-intake/PublicComplaintWizard | Back to home | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 304 |
| components/complaints/public-intake/PublicComplaintWizard | Back | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 388 |
| components/complaints/public-intake/PublicComplaintWizard | Continue | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 397 |
| components/complaints/public-intake/StepsNarrative | Edit | — | No | src/components/complaints/public-intake/StepsNarrative.tsx | 559 |
| components/complaints/public-intake/StepsSubject | Remove | — | No | src/components/complaints/public-intake/StepsSubject.tsx | 72 |
| components/complaints/public-intake/StepsSubject | Change | — | No | src/components/complaints/public-intake/StepsSubject.tsx | 120 |
| components/complaints/public-intake/StepsSubject | More than one business or person is involved | — | No | src/components/complaints/public-intake/StepsSubject.tsx | 326 |
| components/complaints/QueryErrorState | Retry | — | Yes | src/components/complaints/QueryErrorState.tsx | 41 |
| components/complaints/QueryErrorState | Retry | — | Yes | src/components/complaints/QueryErrorState.tsx | 59 |
| components/complaints/RaiseComplaintRfiDialog | Add question | — | No | src/components/complaints/RaiseComplaintRfiDialog.tsx | 199 |
| components/complaints/RaiseComplaintRfiDialog | Cancel | — | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 251 |
| components/complaints/RaiseComplaintRfiDialog | Save draft | — | No | src/components/complaints/RaiseComplaintRfiDialog.tsx | 254 |
| components/complaints/RaiseComplaintRfiDialog | Submit for approval | — | No | src/components/complaints/RaiseComplaintRfiDialog.tsx | 257 |
| components/complaints/RaiseComplaintRfiDialog | Issue request | — | No | src/components/complaints/RaiseComplaintRfiDialog.tsx | 262 |
| components/complaints/ReviewRfiDialog | Add question | — | No | src/components/complaints/ReviewRfiDialog.tsx | 233 |
| components/complaints/ReviewRfiDialog | Close | complaint_management.edit | Yes | src/components/complaints/ReviewRfiDialog.tsx | 322 |
| components/complaints/ReviewRfiDialog | Save changes | complaint_management.edit | No | src/components/complaints/ReviewRfiDialog.tsx | 324 |
| components/complaints/ReviewRfiDialog | Submit for approval | complaint_management.edit | Yes | src/components/complaints/ReviewRfiDialog.tsx | 329 |
| components/complaints/ReviewRfiDialog | Reject | complaint_management.approve_rfi | Yes | src/components/complaints/ReviewRfiDialog.tsx | 336 |
| components/complaints/ReviewRfiDialog | Approve &amp; dispatch | complaint_management.approve_rfi | Yes | src/components/complaints/ReviewRfiDialog.tsx | 344 |
| components/complaints/RfiAttachmentList | Remove | — | No | src/components/complaints/RfiAttachmentList.tsx | 44 |
| components/complaints/triage/TriagePanel | Open jurisdiction assessment | complaint_management.retry_triage | Yes | src/components/complaints/triage/TriagePanel.tsx | 179 |
| components/complaints/triage/TriagePanel | Re-run | complaint_management.retry_triage | Yes | src/components/complaints/triage/TriagePanel.tsx | 192 |
| components/complaints/TriageHistoryCard | Close | — | Yes | src/components/complaints/TriageHistoryCard.tsx | 145 |
| components/complaints/VulnerabilityReviewBanner | Complete review | complaint_management.edit | Yes | src/components/complaints/VulnerabilityReviewBanner.tsx | 107 |
| components/complaints/VulnerabilityReviewBanner | Cancel | — | Yes | src/components/complaints/VulnerabilityReviewBanner.tsx | 174 |
| components/complaints/WorkflowActionPanel | Cancel | complaint_management.edit | Yes | src/components/complaints/WorkflowActionPanel.tsx | 230 |
| components/complaints/WorkflowActionPanel | Confirm: | complaint_management.edit | Yes | src/components/complaints/WorkflowActionPanel.tsx | 233 |
| components/conduct/analytics/ConductDrillthroughPanel | Apply to filters | — | No | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 101 |
| components/conduct/analytics/ConductDrillthroughPanel | View in complaints list | — | Yes | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 102 |
| components/conduct/analytics/ConductDrillthroughPanel | Clear | — | Yes | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 103 |
| components/conduct/analytics/SavedViewsBar | No saved views yet | — | No | src/components/conduct/analytics/SavedViewsBar.tsx | 49 |
| components/conduct/analytics/SavedViewsBar | Save current | — | No | src/components/conduct/analytics/SavedViewsBar.tsx | 60 |
| components/conduct/analytics/SavedViewsBar | Update “ ” | — | No | src/components/conduct/analytics/SavedViewsBar.tsx | 66 |
| components/conduct/analytics/SavedViewsBar | Cancel | — | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 107 |
| components/conduct/analytics/SavedViewsBar | Save view | — | No | src/components/conduct/analytics/SavedViewsBar.tsx | 108 |
| components/conduct/ClosurePanel | Print / PDF | — | No | src/components/conduct/ClosurePanel.tsx | 251 |
| components/conduct/ClosurePanel | Open enforcement case from this investigation | market_conduct.edit | Yes | src/components/conduct/ClosurePanel.tsx | 334 |
| components/conduct/ClosurePanel | Save draft | market_conduct.edit | Yes | src/components/conduct/ClosurePanel.tsx | 389 |
| components/conduct/ClosurePanel | Submit for approval | market_conduct.edit | Yes | src/components/conduct/ClosurePanel.tsx | 393 |
| components/conduct/ClosurePanel | Return | market_conduct.approve | Yes | src/components/conduct/ClosurePanel.tsx | 403 |
| components/conduct/ClosurePanel | Approve | market_conduct.approve | Yes | src/components/conduct/ClosurePanel.tsx | 407 |
| components/conduct/ConductRelatedCasesPanel | Open | — | Yes | src/components/conduct/ConductRelatedCasesPanel.tsx | 158 |
| components/conduct/ConductRelatedCasesPanel | Open | — | Yes | src/components/conduct/ConductRelatedCasesPanel.tsx | 193 |
| components/conduct/ConductRelatedCasesPanel | Open correspondence work queue | — | Yes | src/components/conduct/ConductRelatedCasesPanel.tsx | 199 |
| components/conduct/EvidenceRepositoryPanel | Upload | market_conduct.edit | Yes | src/components/conduct/EvidenceRepositoryPanel.tsx | 142 |
| components/conduct/EvidenceRepositoryPanel | Select file | market_conduct.edit | Yes | src/components/conduct/EvidenceRepositoryPanel.tsx | 217 |
| components/conduct/intelligence/PlanningAdvisoryPanel | Use as a starting point | — | No | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 149 |
| components/conduct/intelligence/PlanningAdvisoryPanel | Cancel | — | Yes | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 470 |
| components/conduct/intelligence/PlanningAdvisoryPanel | Record decision | — | No | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 471 |
| components/conduct/InterviewRecordDialog | Cancel interview | market_conduct.edit | No | src/components/conduct/InterviewRecordDialog.tsx | 249 |
| components/conduct/InterviewRecordDialog | Close | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 253 |
| components/conduct/InterviewRecordDialog | Add | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 328 |
| components/conduct/InterviewRecordDialog | Select file | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 465 |
| components/conduct/InterviewRecordDialog | Upload document | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 470 |
| components/conduct/InterviewRecordDialog | Finalise record | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 562 |
| components/conduct/InterviewsPanel | Add interview | market_conduct.edit | Yes | src/components/conduct/InterviewsPanel.tsx | 57 |
| components/conduct/InterviewsPanel | Open | — | Yes | src/components/conduct/InterviewsPanel.tsx | 105 |
| components/conduct/InvestigationCaseFilePanel | Save case file | market_conduct.edit | Yes | src/components/conduct/InvestigationCaseFilePanel.tsx | 74 |
| components/conduct/IssueActionDialog | Cancel | conduct_management.create | Yes | src/components/conduct/IssueActionDialog.tsx | 149 |
| components/conduct/IssueActionDialog | Issue action | conduct_management.create | Yes | src/components/conduct/IssueActionDialog.tsx | 150 |
| components/conduct/planning/EntityPlanningLinksCard | Open | — | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 80 |
| components/conduct/planning/EntityPlanningLinksCard | Open | — | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 114 |
| components/conduct/planning/EntityPlanningLinksCard | Open | — | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 156 |
| components/conduct/planning/EntityPlanningLinksCard | — | — | No | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 174 |
| components/conduct/planning/RaiseAttentionFromRisk | Open | — | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 110 |
| components/conduct/planning/RaiseAttentionFromRisk | Raise for supervisory attention | — | No | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 120 |
| components/conduct/planning/RaiseAttentionFromRisk | Cancel | — | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 178 |
| components/conduct/planning/RaiseAttentionFromRisk | Raise for attention | — | No | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 179 |
| components/conduct/PostClosureMonitoringPanel | Record | market_conduct.edit | Yes | src/components/conduct/PostClosureMonitoringPanel.tsx | 64 |
| components/conduct/PostClosureMonitoringPanel | Save directive | market_conduct.edit | Yes | src/components/conduct/PostClosureMonitoringPanel.tsx | 194 |
| components/conduct/reporting/NarrativeAdoptionDialog | Cancel | — | Yes | src/components/conduct/reporting/NarrativeAdoptionDialog.tsx | 123 |
| components/conduct/reporting/NarrativeAdoptionDialog | Adopt into report | — | No | src/components/conduct/reporting/NarrativeAdoptionDialog.tsx | 124 |
| components/conduct/reporting/ReportingAdvisoryPanel | Adopt into a report section | — | No | src/components/conduct/reporting/ReportingAdvisoryPanel.tsx | 254 |
| components/conduct/supervision-loop/EntityConductTimeline | Annotate | — | No | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 91 |
| components/conduct/supervision-loop/EntityConductTimeline | Cancel | — | Yes | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 115 |
| components/conduct/supervision-loop/EntityConductTimeline | Save | — | No | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 116 |
| components/conduct/supervision-loop/UnresolvedRisksPanel | Action Required | — | No | src/components/conduct/supervision-loop/UnresolvedRisksPanel.tsx | 49 |
| components/conduct/surveillance/SignalDetailDrawer | Record disposition | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 178 |
| components/conduct/surveillance/SignalDetailDrawer | Refer to investigation | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 245 |
| components/conduct/surveillance/SignalDetailDrawer | Add evidence record | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 279 |
| components/conduct/three-sixty/advisory/AdvisoryCard | Check freshness | — | No | src/components/conduct/three-sixty/advisory/AdvisoryCard.tsx | 232 |
| components/conduct/three-sixty/advisory/AdvisoryCard | Decision history ( ) | — | No | src/components/conduct/three-sixty/advisory/AdvisoryCard.tsx | 245 |
| components/conduct/three-sixty/advisory/AdvisoryProvenance | Technical provenance | — | No | src/components/conduct/three-sixty/advisory/AdvisoryProvenance.tsx | 47 |
| components/conduct/three-sixty/advisory/AdvisoryReviewDialog | Cancel | — | Yes | src/components/conduct/three-sixty/advisory/AdvisoryReviewDialog.tsx | 126 |
| components/conduct/three-sixty/advisory/AdvisoryReviewDialog | Record decision | — | No | src/components/conduct/three-sixty/advisory/AdvisoryReviewDialog.tsx | 127 |
| components/coordination/EscalationsTab | Raise Escalation | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 137 |
| components/coordination/EscalationsTab | Cancel | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 174 |
| components/coordination/EscalationsTab | Raise | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 175 |
| components/coordination/EscalationsTab | Mark under review | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 224 |
| components/coordination/EscalationsTab | Reassign | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 229 |
| components/coordination/EscalationsTab | Resolve | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 232 |
| components/coordination/EscalationsTab | Withdraw | coordination.edit | Yes | src/components/coordination/EscalationsTab.tsx | 235 |
| components/coordination/EscalationsTab | Cancel | — | Yes | src/components/coordination/EscalationsTab.tsx | 292 |
| components/coordination/EscalationsTab | Confirm | — | Yes | src/components/coordination/EscalationsTab.tsx | 293 |
| components/correspondence/AssignmentPanel | Save assignment | settings.edit | Yes | src/components/correspondence/AssignmentPanel.tsx | 65 |
| components/correspondence/CaseThreadsPanel | Open manager | — | Yes | src/components/correspondence/CaseThreadsPanel.tsx | 83 |
| components/correspondence/CaseThreadsPanel | Back to list | — | Yes | src/components/correspondence/CaseThreadsPanel.tsx | 117 |
| components/correspondence/ClassificationPanel | Save classification | settings.edit | Yes | src/components/correspondence/ClassificationPanel.tsx | 75 |
| components/correspondence/IntakeForm | Cancel | correspondence_management.approve | Yes | src/components/correspondence/IntakeForm.tsx | 266 |
| components/correspondence/IntakeForm | Capture &amp; auto-route | correspondence_management.approve | Yes | src/components/correspondence/IntakeForm.tsx | 267 |
| components/correspondence/MessageThreadPanel | Edit | — | No | src/components/correspondence/MessageThreadPanel.tsx | 217 |
| components/correspondence/MessageThreadPanel | Save draft | — | No | src/components/correspondence/MessageThreadPanel.tsx | 297 |
| components/correspondence/MessageThreadPanel | Send | — | No | src/components/correspondence/MessageThreadPanel.tsx | 298 |
| components/correspondence/ResponseComposer | Preview | correspondence_management.approve | Yes | src/components/correspondence/ResponseComposer.tsx | 131 |
| components/correspondence/ResponseComposer | Send response | correspondence_management.approve | Yes | src/components/correspondence/ResponseComposer.tsx | 142 |
| components/correspondence/ReviewApprovalPanel | Start review | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 45 |
| components/correspondence/ReviewApprovalPanel | Approve response | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 48 |
| components/correspondence/ReviewApprovalPanel | Send back for revision | correspondence_management.reject | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 51 |
| components/correspondence/ReviewApprovalPanel | Close correspondence | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 54 |
| components/correspondence/SendCorrespondenceDialog | Send correspondence | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 123 |
| components/correspondence/SendCorrespondenceDialog | Cancel | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 188 |
| components/correspondence/SendCorrespondenceDialog | Send | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 189 |
| components/correspondence/ThreadDetail | Await response | — | No | src/components/correspondence/ThreadDetail.tsx | 144 |
| components/correspondence/ThreadDetail | Reopen | — | No | src/components/correspondence/ThreadDetail.tsx | 150 |
| components/correspondence/ThreadDetail | Close thread | — | No | src/components/correspondence/ThreadDetail.tsx | 156 |
| components/correspondence/ThreadDetail | Add colleague | — | No | src/components/correspondence/ThreadDetail.tsx | 200 |
| components/correspondence/ThreadDetail | Cancel | — | Yes | src/components/correspondence/ThreadDetail.tsx | 257 |
| components/correspondence/ThreadDetail | Close thread | — | No | src/components/correspondence/ThreadDetail.tsx | 258 |
| components/correspondence/ThreadDetail | Cancel | — | Yes | src/components/correspondence/ThreadDetail.tsx | 271 |
| components/correspondence/ThreadDetail | Reopen thread | — | No | src/components/correspondence/ThreadDetail.tsx | 272 |
| components/correspondence/ThreadDetail | Cancel | — | Yes | src/components/correspondence/ThreadDetail.tsx | 290 |
| components/correspondence/ThreadDetail | Add colleague | — | No | src/components/correspondence/ThreadDetail.tsx | 291 |
| components/correspondence/ThreadList | Clear | — | Yes | src/components/correspondence/ThreadList.tsx | 138 |
| components/dashboard/applicant/ActionRequiredList | Continue | — | Yes | src/components/dashboard/applicant/ActionRequiredList.tsx | 84 |
| components/dashboard/applicant/RequiredFormsList | New | application_management.edit | Yes | src/components/dashboard/applicant/RequiredFormsList.tsx | 67 |
| components/dashboard/ApplicantDashboard | New application | application_management.create | Yes | src/components/dashboard/ApplicantDashboard.tsx | 124 |
| components/dashboard/ApplicationCard | View Details | application_management.edit | Yes | src/components/dashboard/ApplicationCard.tsx | 72 |
| components/dashboard/ApplicationCard | Review | application_management.edit | Yes | src/components/dashboard/ApplicationCard.tsx | 77 |
| components/dashboard/cards/LicenseStatusList | Continue Renewal | license_management.edit | Yes | src/components/dashboard/cards/LicenseStatusList.tsx | 162 |
| components/dashboard/cards/LicenseStatusList | Renew | license_management.edit | Yes | src/components/dashboard/cards/LicenseStatusList.tsx | 168 |
| components/dashboard/ExecutiveSupervisoryDashboard | Breach Inbox | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 466 |
| components/dashboard/ExecutiveSupervisoryDashboard | Enforcement Queue | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 469 |
| components/dashboard/ExecutiveSupervisoryDashboard | Risk Heatmap | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 472 |
| components/dashboard/ExecutiveSupervisoryDashboard | Supervisory Plans | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 475 |
| components/dashboard/ExecutiveSupervisoryDashboard | Inspections | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 478 |
| components/dashboard/ExecutiveSupervisoryDashboard | Prudential Actions | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 481 |
| components/dashboard/ExecutiveSupervisoryDashboard | Conduct Alerts | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 484 |
| components/dashboard/ExecutiveSupervisoryDashboard | Complaints Analytics | prudential_supervision.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 487 |
| components/dashboard/ExecutiveSupervisoryDashboard | AI Insights Hub | report_management.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 490 |
| components/dashboard/LicenseeDashboard | Continue Renewal | license_management.edit | Yes | src/components/dashboard/LicenseeDashboard.tsx | 185 |
| components/dashboard/LicenseeDashboard | Renew | license_management.edit | Yes | src/components/dashboard/LicenseeDashboard.tsx | 191 |
| components/dashboard/LicenseExpiryBanner | Renew License | application_management.edit | Yes | src/components/dashboard/LicenseExpiryBanner.tsx | 50 |
| components/dashboard/ReturnCard | Final Submit | returns_management.edit | Yes | src/components/dashboard/ReturnCard.tsx | 106 |
| components/dashboard/ReturnCard | Save Draft | returns_management.edit | Yes | src/components/dashboard/ReturnCard.tsx | 115 |
| components/dashboard/widgets/index | Start Application | application_management.edit | Yes | src/components/dashboard/widgets/index.tsx | 246 |
| components/dashboard/widgets/index | View All | — | Yes | src/components/dashboard/widgets/index.tsx | 288 |
| components/dashboard/widgets/index | View All | — | Yes | src/components/dashboard/widgets/index.tsx | 359 |
| components/dashboard/widgets/index | Continue | — | Yes | src/components/dashboard/widgets/index.tsx | 391 |
| components/data-grid/EnterpriseDataGrid | Refresh | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 162 |
| components/data-grid/EnterpriseDataGrid | Columns | — | No | src/components/data-grid/EnterpriseDataGrid.tsx | 170 |
| components/data-grid/EnterpriseDataGrid | Export | — | No | src/components/data-grid/EnterpriseDataGrid.tsx | 197 |
| components/data-grid/EnterpriseDataGrid | Try again | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 279 |
| components/data-grid/EnterpriseDataGrid | Previous | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 401 |
| components/data-grid/EnterpriseDataGrid | Next | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 411 |
| components/data-grid/GridFilterBar | Filters {activeCount > 0 && } | — | No | src/components/data-grid/GridFilterBar.tsx | 65 |
| components/data-grid/GridFilterBar | Reset | — | Yes | src/components/data-grid/GridFilterBar.tsx | 75 |
| components/documents/DocumentExtractionPanel | Extract | settings.edit | Yes | src/components/documents/DocumentExtractionPanel.tsx | 80 |
| components/documents/DocumentUpload | {uploading ? ( Uploading file ... ) : ( Upload file )} | settings.edit | Yes | src/components/documents/DocumentUpload.tsx | 112 |
| components/documents/versioned/DocumentGroupList | Download | settings.view | Yes | src/components/documents/versioned/DocumentGroupList.tsx | 121 |
| components/documents/versioned/DocumentGroupList | History | — | Yes | src/components/documents/versioned/DocumentGroupList.tsx | 125 |
| components/documents/versioned/DocumentVersionHistoryDialog | Download | settings.view | Yes | src/components/documents/versioned/DocumentVersionHistoryDialog.tsx | 113 |
| components/documents/versioned/VersionedDocumentUploader | {uploading ? ( Uploading… ) : ( Upload file )} | application_management.edit | Yes | src/components/documents/versioned/VersionedDocumentUploader.tsx | 237 |
| components/documents/versioned/VersionedDocumentUploader | Clear uploaded | application_management.edit | Yes | src/components/documents/versioned/VersionedDocumentUploader.tsx | 254 |
| components/enforcement/ReferToEnforcementDialog | Cancel | enforcement_management.refer | Yes | src/components/enforcement/ReferToEnforcementDialog.tsx | 147 |
| components/enforcement/ReferToEnforcementDialog | Refer to enforcement | enforcement_management.refer | Yes | src/components/enforcement/ReferToEnforcementDialog.tsx | 148 |
| components/entity-detail/BackgroundInfoTab | Save Changes | license_management.edit | Yes | src/components/entity-detail/BackgroundInfoTab.tsx | 760 |
| components/entity-detail/EmployeeCombobox | {selected && ( } className="rounded p-0.5 hover:bg-accent" > )} | license_management.edit | Yes | src/components/entity-detail/EmployeeCombobox.tsx | 46 |
| components/entity-detail/Entity360Header | Structure workspace | — | No | src/components/entity-detail/Entity360Header.tsx | 69 |
| components/entity-detail/Entity360Header | Public register | — | No | src/components/entity-detail/Entity360Header.tsx | 75 |
| components/entity-detail/Entity360Header | Return to current state | — | Yes | src/components/entity-detail/Entity360Header.tsx | 148 |
| components/entity-detail/Entity360TimelinePanel | Show all domains | — | No | src/components/entity-detail/Entity360TimelinePanel.tsx | 54 |
| components/entity-detail/InspectionsTab | Add | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 63 |
| components/entity-detail/InspectionsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 99 |
| components/entity-detail/InspectionsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 99 |
| components/entity-detail/LicensesTab | View | — | Yes | src/components/entity-detail/LicensesTab.tsx | 95 |
| components/entity-detail/LicensingAuditTab | Issue determination | license_management.approve | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 400 |
| components/entity-detail/LicensingAuditTab | Generate risk profile | licensee_management.edit | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 460 |
| components/entity-detail/LicensingAuditTab | Auto-create initial plan | licensee_management.edit | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 488 |
| components/entity-detail/LicensingAuditTab | Open Supervisory Plan | — | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 493 |
| components/entity-detail/PrimaryUserCard | Cancel | licensee_management.edit | Yes | src/components/entity-detail/PrimaryUserCard.tsx | 196 |
| components/entity-detail/PrimaryUserCard | Assign as Primary User | licensee_management.edit | Yes | src/components/entity-detail/PrimaryUserCard.tsx | 197 |
| components/entity-detail/ProductsChannelsTab | Add product | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 87 |
| components/entity-detail/ProductsChannelsTab | Add channel | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 117 |
| components/entity-detail/ProductsChannelsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 167 |
| components/entity-detail/ProductsChannelsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 168 |
| components/entity-detail/RegisterIdentifierDialog | Add identifier | — | No | src/components/entity-detail/RegisterIdentifierDialog.tsx | 189 |
| components/entity-detail/RegisterIdentifierDialog | Cancel | — | Yes | src/components/entity-detail/RegisterIdentifierDialog.tsx | 285 |
| components/entity-detail/RegisterIdentifierDialog | Register | — | Yes | src/components/entity-detail/RegisterIdentifierDialog.tsx | 288 |
| components/entity-detail/ReinsuranceTab | Add | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 57 |
| components/entity-detail/ReinsuranceTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 102 |
| components/entity-detail/ReinsuranceTab | Save | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 102 |
| components/entity-detail/RelationshipsTab | Add | licensee_management.edit | Yes | src/components/entity-detail/RelationshipsTab.tsx | 102 |
| components/entity-detail/RelationshipsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/RelationshipsTab.tsx | 174 |
| components/entity-detail/RelationshipsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/RelationshipsTab.tsx | 175 |
| components/entity-detail/RiskRatingsTab | New Assessment | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 83 |
| components/entity-detail/RiskRatingsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 116 |
| components/entity-detail/RiskRatingsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 116 |
| components/entity-detail/SupervisoryPlanTab | Generate Initial Supervisory Profile | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 140 |
| components/entity-detail/SupervisoryPlanTab | Add Action | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 179 |
| components/entity-detail/SupervisoryPlanTab | Cancel | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 192 |
| components/entity-detail/SupervisoryPlanTab | Add | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 193 |
| components/entity-detail/SupervisoryPlanTab | Mark complete | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 238 |
| components/entity-detail/VerifyIdentifierDialog | Verify | — | No | src/components/entity-detail/VerifyIdentifierDialog.tsx | 140 |
| components/entity-detail/VerifyIdentifierDialog | Reject | — | No | src/components/entity-detail/VerifyIdentifierDialog.tsx | 143 |
| components/entity-detail/VerifyIdentifierDialog | Cancel | — | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 181 |
| components/entity-detail/VerifyIdentifierDialog | Confirm verification | — | No | src/components/entity-detail/VerifyIdentifierDialog.tsx | 182 |
| components/entity-detail/VerifyIdentifierDialog | Cancel | — | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 213 |
| components/entity-detail/VerifyIdentifierDialog | Reject verification | — | No | src/components/entity-detail/VerifyIdentifierDialog.tsx | 214 |
| components/entity-detail/WebUsersTab | Cancel | — | Yes | src/components/entity-detail/WebUsersTab.tsx | 412 |
| components/entity-detail/WebUsersTab | Close | — | Yes | src/components/entity-detail/WebUsersTab.tsx | 447 |
| components/entity-detail/WebUsersTab | Cancel | license_management.edit | Yes | src/components/entity-detail/WebUsersTab.tsx | 488 |
| components/entity-detail/WebUsersTab | Save Changes | license_management.edit | Yes | src/components/entity-detail/WebUsersTab.tsx | 489 |
| components/entity/returns-canonical/EntityFilingForm | Mark form complete | — | No | src/components/entity/returns-canonical/EntityFilingForm.tsx | 206 |
| components/entity/returns-canonical/NewReturnDialog | Cancel | — | Yes | src/components/entity/returns-canonical/NewReturnDialog.tsx | 289 |
| components/escalations/EscalationDetailDrawer | Acknowledge | — | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 82 |
| components/escalations/EscalationDetailDrawer | Take ownership | — | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 88 |
| components/escalations/EscalationDetailDrawer | Escalate tier | — | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 94 |
| components/escalations/EscalationDetailDrawer | Resolve | — | No | src/components/escalations/EscalationDetailDrawer.tsx | 117 |
| components/escalations/EscalationDetailDrawer | Resolve &amp; close | — | No | src/components/escalations/EscalationDetailDrawer.tsx | 121 |
| components/fit-and-proper/AssignCommitteeCard | Assign | fit_and_proper.edit | Yes | src/components/fit-and-proper/AssignCommitteeCard.tsx | 89 |
| components/fit-and-proper/FpAppealsPanel | File appeal | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpAppealsPanel.tsx | 225 |
| components/fit-and-proper/FpAppealsPanel | Assign | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpAppealsPanel.tsx | 264 |
| components/fit-and-proper/FpAppealsPanel | Withdraw | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpAppealsPanel.tsx | 268 |
| components/fit-and-proper/FpAppealsPanel | Withdraw | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpAppealsPanel.tsx | 294 |
| components/fit-and-proper/FpAppealsPanel | Record decision | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpAppealsPanel.tsx | 295 |
| components/fit-and-proper/FpConditionEvidencePanel | Accept | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionEvidencePanel.tsx | 145 |
| components/fit-and-proper/FpConditionEvidencePanel | Reject | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionEvidencePanel.tsx | 154 |
| components/fit-and-proper/FpConditionsPanel | Add condition | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 182 |
| components/fit-and-proper/FpConditionsPanel | Cancel | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 222 |
| components/fit-and-proper/FpConditionsPanel | Save | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 223 |
| components/fit-and-proper/FpConditionsPanel | Mark satisfied | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 258 |
| components/fit-and-proper/FpConditionsPanel | Mark breached | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 259 |
| components/fit-and-proper/FpConditionsPanel | Reopen | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 260 |
| components/fit-and-proper/FpConditionsPanel | Cancel | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 267 |
| components/fit-and-proper/FpConditionsPanel | Confirm breach | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 268 |
| components/fit-and-proper/FpConditionsPanel | Cancel | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 281 |
| components/fit-and-proper/FpConditionsPanel | Confirm reopen | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 282 |
| components/fit-and-proper/FpConditionsPanel | Cancel | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 296 |
| components/fit-and-proper/FpConditionsPanel | Waive | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 297 |
| components/fit-and-proper/FpConditionsPanel | Confirm satisfied | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpConditionsPanel.tsx | 314 |
| components/fit-and-proper/FpDeterminationsPanel | Vote | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpDeterminationsPanel.tsx | 459 |
| components/fit-and-proper/FpDeterminationsPanel | Finalize determination | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpDeterminationsPanel.tsx | 511 |
| components/fit-and-proper/FpDeterminationsPanel | Add Condition | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpDeterminationsPanel.tsx | 545 |
| components/fit-and-proper/FpDeterminationsPanel | Not now | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpDeterminationsPanel.tsx | 573 |
| components/fit-and-proper/FpDeterminationsPanel | Add Condition | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpDeterminationsPanel.tsx | 576 |
| components/fit-and-proper/FpMonitoringPanel | Trigger recheck | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpMonitoringPanel.tsx | 89 |
| components/fit-and-proper/FpMonitoringPanel | Acknowledge | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpMonitoringPanel.tsx | 117 |
| components/fit-and-proper/FpPqAmendmentDialog | Amend | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpPqAmendmentDialog.tsx | 49 |
| components/fit-and-proper/FpPqAmendmentDialog | Cancel | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpPqAmendmentDialog.tsx | 73 |
| components/fit-and-proper/FpPqAmendmentDialog | Request amendment | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpPqAmendmentDialog.tsx | 74 |
| components/fit-and-proper/FpScreeningPanel | AI media scan | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 256 |
| components/fit-and-proper/FpScreeningPanel | Run screening | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 260 |
| components/fit-and-proper/FpScreeningPanel | True positive | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 355 |
| components/fit-and-proper/FpScreeningPanel | False positive | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 358 |
| components/fit-and-proper/FpScreeningPanel | Needs review | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 361 |
| components/fit-and-proper/FpScreeningPanel | Reopen | fit_and_proper.edit | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 367 |
| components/fit-and-proper/FpScreeningPanel | Cancel | — | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 412 |
| components/fit-and-proper/FpScreeningPanel | Confirm | — | Yes | src/components/fit-and-proper/FpScreeningPanel.tsx | 413 |
| components/fit-and-proper/RequestDeclarationDialog | Skip for now | fit_and_proper.edit | Yes | src/components/fit-and-proper/RequestDeclarationDialog.tsx | 370 |
| components/fit-and-proper/RequestDeclarationDialog | Send Request | fit_and_proper.edit | Yes | src/components/fit-and-proper/RequestDeclarationDialog.tsx | 373 |
| components/fit-and-proper/RequestDeclarationDialog | Close | — | Yes | src/components/fit-and-proper/RequestDeclarationDialog.tsx | 383 |
| components/form-builder/CompareReturnsPicker | Cancel | — | Yes | src/components/form-builder/CompareReturnsPicker.tsx | 106 |
| components/form-builder/FieldProperties | Add Option | form_management.edit | Yes | src/components/form-builder/FieldProperties.tsx | 307 |
| components/form-builder/FieldProperties | Add Column | form_management.edit | Yes | src/components/form-builder/FieldProperties.tsx | 462 |
| components/form-builder/FieldProperties | Add Rule | form_management.edit | Yes | src/components/form-builder/FieldProperties.tsx | 688 |
| components/form-builder/FieldProperties | Remove Field | form_management.edit | Yes | src/components/form-builder/FieldProperties.tsx | 738 |
| components/form-builder/FileImport | Back | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1919 |
| components/form-builder/FileImport | Cancel | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1927 |
| components/form-builder/FileImport | Preview Sheet(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1930 |
| components/form-builder/FileImport | Import Field(s) | form_management.import | Yes | src/components/form-builder/FileImport.tsx | 1936 |
| components/form-builder/FileImport | Create Form(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1952 |
| components/form-builder/FileImport | Import Field(s) | form_management.import | Yes | src/components/form-builder/FileImport.tsx | 1958 |
| components/form-builder/FileImport | Select All | — | Yes | src/components/form-builder/FileImport.tsx | 2035 |
| components/form-builder/FileImport | Deselect All | — | Yes | src/components/form-builder/FileImport.tsx | 2036 |
| components/form-builder/FileImport | Back | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2194 |
| components/form-builder/FileImport | Cancel | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2203 |
| components/form-builder/FileImport | Preview Sheet(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2207 |
| components/form-builder/FileImport | Import Field(s) | form_management.import | Yes | src/components/form-builder/FileImport.tsx | 2217 |
| components/form-builder/FileImport | Create Form(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2233 |
| components/form-builder/FileImport | Import Field(s) | form_management.import | Yes | src/components/form-builder/FileImport.tsx | 2240 |
| components/form-builder/SectionManager | Add Section | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 184 |
| components/form-builder/SectionManager | Add First Section | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 194 |
| components/form-builder/SectionManager | col | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 400 |
| components/form-builder/VersionDiffViewer | Compare | form_management.edit | Yes | src/components/form-builder/VersionDiffViewer.tsx | 262 |
| components/form-builder/VersionDiffViewer | Side by side | — | No | src/components/form-builder/VersionDiffViewer.tsx | 344 |
| components/form-builder/VersionDiffViewer | List | — | No | src/components/form-builder/VersionDiffViewer.tsx | 353 |
| components/form-builder/VersionHistory | History | — | Yes | src/components/form-builder/VersionHistory.tsx | 179 |
| components/form-builder/VersionHistory | Cancel | form_management.edit | Yes | src/components/form-builder/VersionHistory.tsx | 408 |
| components/form-builder/VersionHistory | Save schedule | form_management.edit | Yes | src/components/form-builder/VersionHistory.tsx | 409 |
| components/form-renderer/FormRenderer | Upload | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1320 |
| components/form-renderer/FormRenderer | Add Row | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1409 |
| components/form-renderer/FormRenderer | Add Another Entry | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1722 |
| components/form-renderer/FormRenderer | Previous | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1735 |
| components/form-renderer/FormRenderer | Next | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1745 |
| components/form-renderer/FormRenderer | Submit | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1750 |
| components/forms/EmailFieldControl | {cooldown > 0 ? `Resend in $ s` : 'Verify Email'} | — | No | src/components/forms/EmailFieldControl.tsx | 222 |
| components/forms/EmailFieldControl | {cooldown > 0 ? `Resend in $ s` : 'Resend code'} | — | No | src/components/forms/EmailFieldControl.tsx | 250 |
| components/fpa/AutoScreeningRulesTab | Cancel | — | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 285 |
| components/fpa/AutoScreeningRulesTab | Add Rule | fit_and_proper_screening.create | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 430 |
| components/fpa/AutoScreeningRulesTab | Clear filters | — | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 466 |
| components/fpa/AutoScreeningRulesTab | Edit | fit_and_proper_screening.edit | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 545 |
| components/governance/ai/LifecycleActions | Cancel | — | Yes | src/components/governance/ai/LifecycleActions.tsx | 123 |
| components/governance/ai/LifecycleActions | Record status change | — | No | src/components/governance/ai/LifecycleActions.tsx | 124 |
| components/landing/AlreadyRegulatedSection | View Licensee Services | — | Yes | src/components/landing/AlreadyRegulatedSection.tsx | 52 |
| components/landing/AlreadyRegulatedSection | Need access to an existing entity? | — | No | src/components/landing/AlreadyRegulatedSection.tsx | 55 |
| components/landing/HeroSection | Register Now | — | Yes | src/components/landing/HeroSection.tsx | 24 |
| components/landing/HeroSection | Existing User? Login | — | Yes | src/components/landing/HeroSection.tsx | 27 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 66 |
| components/landing/LandingNav | Apply / Register | — | No | src/components/landing/LandingNav.tsx | 69 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 76 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 94 |
| components/landing/LandingNav | Apply / Register | — | No | src/components/landing/LandingNav.tsx | 97 |
| components/layout/Header | {unreadCount > 0 && ( )} | notification_management.view | Yes | src/components/layout/Header.tsx | 105 |
| components/layout/Header | View Profile | — | Yes | src/components/layout/Header.tsx | 226 |
| components/layout/Header | Logout | — | Yes | src/components/layout/Header.tsx | 231 |
| components/licenses/LicenseActionDialog | Cancel | — | Yes | src/components/licenses/LicenseActionDialog.tsx | 237 |
| components/licenses/LicenseConditionsPanel | Submit evidence | — | No | src/components/licenses/LicenseConditionsPanel.tsx | 172 |
| components/licenses/LicenseConditionsPanel | Cancel | — | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 208 |
| components/licenses/LicenseConditionsPanel | Confirm | — | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 209 |
| components/licenses/LicenseConditionsPanel | Cancel | — | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 234 |
| components/licenses/LicenseConditionsPanel | Submit for review | — | No | src/components/licenses/LicenseConditionsPanel.tsx | 235 |
| components/licenses/LicenseDecisionAppealsPanel | Lodge appeal | — | No | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 73 |
| components/licenses/LicenseDecisionAppealsPanel | Acknowledge | — | No | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 100 |
| components/licenses/LicenseDecisionAppealsPanel | Determine | — | No | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 106 |
| components/licenses/LicenseDecisionAppealsPanel | Cancel | — | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 150 |
| components/licenses/LicenseDecisionAppealsPanel | Lodge | — | No | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 151 |
| components/licenses/LicenseDecisionAppealsPanel | Cancel | — | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 181 |
| components/licenses/LicenseDecisionAppealsPanel | Record determination | — | No | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 182 |
| components/licenses/LicenseFeeLedgerPanel | Record payment | — | No | src/components/licenses/LicenseFeeLedgerPanel.tsx | 136 |
| components/licenses/LicenseFeeLedgerPanel | Verify | — | No | src/components/licenses/LicenseFeeLedgerPanel.tsx | 141 |
| components/licenses/LicenseFeeLedgerPanel | Waive | — | No | src/components/licenses/LicenseFeeLedgerPanel.tsx | 144 |
| components/licenses/LicenseFeeLedgerPanel | Cancel | — | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 178 |
| components/licenses/LicenseFeeLedgerPanel | Confirm | — | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 179 |
| components/licenses/LicenseRelatedCasesPanel | Open | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 138 |
| components/licenses/LicenseRelatedCasesPanel | Open | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 173 |
| components/licenses/LicenseRelatedCasesPanel | Open correspondence workspace | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 179 |
| components/licenses/LicenseSignaturePanel | Generate Certificate | — | No | src/components/licenses/LicenseSignaturePanel.tsx | 203 |
| components/licenses/LicenseSignaturePanel | Dispatch to Licensee | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 261 |
| components/licenses/LicenseSignaturePanel | Cancel | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 314 |
| components/licenses/LicenseSignaturePanel | Sign | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 315 |
| components/licenses/LicenseSignaturePanel | Cancel | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 336 |
| components/licenses/LicenseSignaturePanel | Dispatch | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 337 |
| components/licenses/LicenseVariationPanel | Open variation | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 113 |
| components/licenses/LicenseVariationPanel | Decide | — | No | src/components/licenses/LicenseVariationPanel.tsx | 136 |
| components/licenses/LicenseVariationPanel | Add change | — | No | src/components/licenses/LicenseVariationPanel.tsx | 202 |
| components/licenses/LicenseVariationPanel | Cancel | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 209 |
| components/licenses/LicenseVariationPanel | Open variation | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 210 |
| components/licenses/LicenseVariationPanel | Cancel | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 243 |
| components/licenses/LicenseVariationPanel | Record decision | — | No | src/components/licenses/LicenseVariationPanel.tsx | 244 |
| components/licenses/LicenseVerificationPanel | Start verification | — | No | src/components/licenses/LicenseVerificationPanel.tsx | 64 |
| components/licenses/LicenseVerificationPanel | Complete | — | No | src/components/licenses/LicenseVerificationPanel.tsx | 89 |
| components/licenses/LicenseVerificationPanel | Record | — | No | src/components/licenses/LicenseVerificationPanel.tsx | 107 |
| components/licenses/LicenseVerificationPanel | Cancel | — | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 136 |
| components/licenses/LicenseVerificationPanel | Start | — | No | src/components/licenses/LicenseVerificationPanel.tsx | 137 |
| components/licenses/LicenseVerificationPanel | Cancel | — | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 166 |
| components/licenses/LicenseVerificationPanel | Save | — | No | src/components/licenses/LicenseVerificationPanel.tsx | 167 |
| components/notifications/DeadLetterQueue | Resend | — | Yes | src/components/notifications/DeadLetterQueue.tsx | 138 |
| components/notifications/ForwardNotificationDialog | Cancel | — | Yes | src/components/notifications/ForwardNotificationDialog.tsx | 115 |
| components/notifications/ForwardNotificationDialog | Forward | — | No | src/components/notifications/ForwardNotificationDialog.tsx | 116 |
| components/notifications/NotificationDetailDrawer | Open record | — | Yes | src/components/notifications/NotificationDetailDrawer.tsx | 122 |
| components/notifications/NotificationDetailDrawer | Mark read | — | No | src/components/notifications/NotificationDetailDrawer.tsx | 127 |
| components/notifications/NotificationDetailDrawer | Forward | — | No | src/components/notifications/NotificationDetailDrawer.tsx | 131 |
| components/notifications/NotificationDetailDrawer | Archive | — | No | src/components/notifications/NotificationDetailDrawer.tsx | 135 |
| components/notifications/NotificationPreferenceMatrix | Try again | — | Yes | src/components/notifications/NotificationPreferenceMatrix.tsx | 132 |
| components/notifications/NotificationPreferenceMatrix | Reset | — | Yes | src/components/notifications/NotificationPreferenceMatrix.tsx | 287 |
| components/notifications/NotificationPreferenceMatrix | Save Changes | — | No | src/components/notifications/NotificationPreferenceMatrix.tsx | 290 |
| components/notifications/TemplatePreviewDialog | Close | notification_management.test_send | Yes | src/components/notifications/TemplatePreviewDialog.tsx | 131 |
| components/notifications/TemplatePreviewDialog | Send test to me | notification_management.test_send | Yes | src/components/notifications/TemplatePreviewDialog.tsx | 132 |
| components/payments/OfflinePaymentDialog | Cancel | — | Yes | src/components/payments/OfflinePaymentDialog.tsx | 192 |
| components/payments/OfflinePaymentDialog | Submit for verification | — | No | src/components/payments/OfflinePaymentDialog.tsx | 193 |
| components/payments/OfflinePaymentDialog | Done | — | Yes | src/components/payments/OfflinePaymentDialog.tsx | 207 |
| components/payments/PaymentAttachments | Upload Proof | fee_management.edit | Yes | src/components/payments/PaymentAttachments.tsx | 144 |
| components/payments/PaymentRemarksThread | Add Remark | fee_management.create | Yes | src/components/payments/PaymentRemarksThread.tsx | 150 |
| components/payments/PaymentRemarksThread | Cancel | fee_management.edit | Yes | src/components/payments/PaymentRemarksThread.tsx | 193 |
| components/payments/PaymentRemarksThread | Save | fee_management.edit | Yes | src/components/payments/PaymentRemarksThread.tsx | 196 |
| components/prudential/CreatePrudentialActionDialog | Cancel | — | Yes | src/components/prudential/CreatePrudentialActionDialog.tsx | 106 |
| components/prudential/CreatePrudentialEscalationDialog | Cancel | — | Yes | src/components/prudential/CreatePrudentialEscalationDialog.tsx | 79 |
| components/prudential/EwiPanel | Review | prudential_supervision.workflow_action | Yes | src/components/prudential/EwiPanel.tsx | 149 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 103 |
| components/prudential/examination/DataRequestsPanel | ( ) | — | No | src/components/prudential/examination/DataRequestsPanel.tsx | 127 |
| components/prudential/examination/DataRequestsPanel | Send request | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 169 |
| components/prudential/examination/DataRequestsPanel | Confirm received | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 175 |
| components/prudential/examination/DataRequestsPanel | Mark as received | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 179 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 198 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 232 |
| components/prudential/examination/DataRequestsPanel | Cancel | — | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 235 |
| components/prudential/examination/EntityExaminationsTab | New examination | prudential_supervision.edit | Yes | src/components/prudential/examination/EntityExaminationsTab.tsx | 16 |
| components/prudential/examination/ExaminationResolveBanner | Return to current step | — | Yes | src/components/prudential/examination/ExaminationResolveBanner.tsx | 29 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 80 |
| components/prudential/examination/ExaminationStageActions | Resolve | prudential_supervision.edit | No | src/components/prudential/examination/ExaminationStageActions.tsx | 146 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 166 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 183 |
| components/prudential/examination/ExaminationStageActions | More actions | prudential_supervision.workflow_action | No | src/components/prudential/examination/ExaminationStageActions.tsx | 192 |
| components/prudential/examination/ExaminationStageActions | Cancel examination | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 197 |
| components/prudential/examination/FindingsPanel | Add finding | prudential_supervision.edit | Yes | src/components/prudential/examination/FindingsPanel.tsx | 160 |
| components/prudential/examination/FindingsPanel | Create corrective action | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/FindingsPanel.tsx | 213 |
| components/prudential/examination/FindingsPanel | Close finding | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/FindingsPanel.tsx | 219 |
| components/prudential/examination/FindingsPanel | Add finding | prudential_supervision.edit | Yes | src/components/prudential/examination/FindingsPanel.tsx | 232 |
| components/prudential/examination/FindingsPanel | Add finding | prudential_supervision.edit | Yes | src/components/prudential/examination/FindingsPanel.tsx | 290 |
| components/prudential/examination/FindingsPanel | Cancel | — | Yes | src/components/prudential/examination/FindingsPanel.tsx | 293 |
| components/prudential/examination/NextActionCard | Resolve | — | No | src/components/prudential/examination/NextActionCard.tsx | 75 |
| components/prudential/examination/NextActionCard | Go to | — | Yes | src/components/prudential/examination/NextActionCard.tsx | 89 |
| components/prudential/examination/ReportsPanel | Prepare report | prudential_supervision.edit | Yes | src/components/prudential/examination/ReportsPanel.tsx | 101 |
| components/prudential/examination/ReportsPanel | Send for review | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ReportsPanel.tsx | 148 |
| components/prudential/examination/ReportsPanel | Approve report | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ReportsPanel.tsx | 153 |
| components/prudential/examination/ReportsPanel | Issue to entity | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ReportsPanel.tsx | 158 |
| components/prudential/examination/ReportsPanel | Save management response | prudential_supervision.edit | Yes | src/components/prudential/examination/ReportsPanel.tsx | 163 |
| components/prudential/examination/ReportsPanel | Prepare another report | prudential_supervision.edit | Yes | src/components/prudential/examination/ReportsPanel.tsx | 173 |
| components/prudential/examination/ReportsPanel | Prepare report | prudential_supervision.edit | Yes | src/components/prudential/examination/ReportsPanel.tsx | 214 |
| components/prudential/examination/ReportsPanel | Cancel | — | Yes | src/components/prudential/examination/ReportsPanel.tsx | 217 |
| components/prudential/examination/ScopingMemoPanel | Approve scope | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ScopingMemoPanel.tsx | 136 |
| components/prudential/examination/TeamPanel | Assign lead examiner | prudential_supervision.edit | Yes | src/components/prudential/examination/TeamPanel.tsx | 105 |
| components/prudential/examination/TeamPanel | Add team member | prudential_supervision.edit | Yes | src/components/prudential/examination/TeamPanel.tsx | 123 |
| components/prudential/examination/TeamPanel | Add team member | prudential_supervision.edit | Yes | src/components/prudential/examination/TeamPanel.tsx | 156 |
| components/prudential/examination/TeamPanel | Additional details (optional) | — | No | src/components/prudential/examination/TeamPanel.tsx | 202 |
| components/prudential/examination/TeamPanel | Add to team | prudential_supervision.edit | Yes | src/components/prudential/examination/TeamPanel.tsx | 233 |
| components/prudential/examination/TeamPanel | Cancel | — | Yes | src/components/prudential/examination/TeamPanel.tsx | 236 |
| components/prudential/examination/WorkpapersPanel | Add workpaper | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 69 |
| components/prudential/examination/WorkpapersPanel | Sign off as preparer | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 97 |
| components/prudential/examination/WorkpapersPanel | Sign off as reviewer | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 103 |
| components/prudential/examination/WorkpapersPanel | Add workpaper | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 117 |
| components/prudential/examination/WorkpapersPanel | Add workpaper | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 149 |
| components/prudential/examination/WorkpapersPanel | Cancel | — | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 152 |
| components/prudential/FormulaBuilder | Add | — | No | src/components/prudential/FormulaBuilder.tsx | 372 |
| components/prudential/GroupEwiPanel | Acknowledge | — | No | src/components/prudential/GroupEwiPanel.tsx | 62 |
| components/prudential/GroupStructureTree | Edit | — | No | src/components/prudential/GroupStructureTree.tsx | 62 |
| components/prudential/payments/IncidentsPanel | Save | prudential_supervision.edit | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 118 |
| components/prudential/payments/IncidentsPanel | Record incident | prudential_supervision.create | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 139 |
| components/prudential/payments/IncidentsPanel | Resolve | prudential_supervision.edit | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 193 |
| components/prudential/payments/IncidentsPanel | Cancel | — | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 268 |
| components/prudential/payments/IncidentsPanel | Cancel | — | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 285 |
| components/prudential/payments/OperatorDialog | Cancel | — | Yes | src/components/prudential/payments/OperatorDialog.tsx | 169 |
| components/prudential/payments/OperatorTable | Add operator | prudential_supervision.create | Yes | src/components/prudential/payments/OperatorTable.tsx | 74 |
| components/prudential/payments/OperatorTable | Edit | prudential_supervision.create | No | src/components/prudential/payments/OperatorTable.tsx | 133 |
| components/prudential/payments/OperatorTable | Start PFMI assessment | prudential_supervision.create | Yes | src/components/prudential/payments/OperatorTable.tsx | 135 |
| components/prudential/payments/RetailPaymentsPanel | Record period figures | prudential_supervision.create | Yes | src/components/prudential/payments/RetailPaymentsPanel.tsx | 81 |
| components/prudential/payments/RetailPaymentsPanel | Cancel | — | Yes | src/components/prudential/payments/RetailPaymentsPanel.tsx | 178 |
| components/prudential/PrudentialActionDrawer | Open source | — | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 69 |
| components/prudential/PrudentialActionDrawer | Accept | prudential_supervision.workflow_action | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 104 |
| components/prudential/PrudentialActionDrawer | Reject | prudential_supervision.workflow_action | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 113 |
| components/prudential/PrudentialActionDrawer | Confirm | prudential_supervision.edit | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 139 |
| components/prudential/PrudentialEntityHistoryDrawer | Refresh | — | Yes | src/components/prudential/PrudentialEntityHistoryDrawer.tsx | 191 |
| components/prudential/RatioEditDialog | Cancel | prudential_supervision.edit | Yes | src/components/prudential/RatioEditDialog.tsx | 252 |
| components/prudential/RiskScoreExplainer | Open supervisory profile | — | Yes | src/components/prudential/RiskScoreExplainer.tsx | 193 |
| components/prudential/RiskScoreExplainer | Review ( ) | — | No | src/components/prudential/RiskScoreExplainer.tsx | 202 |
| components/rbac/RoleMigrationRunnerDialog | Close | — | Yes | src/components/rbac/RoleMigrationRunnerDialog.tsx | 219 |
| components/rbac/RoleMigrationRunnerDialog | {running ? 'Running…' : `Classify $ role$ `} | — | No | src/components/rbac/RoleMigrationRunnerDialog.tsx | 222 |
| components/registration-builder/FieldEditor | Add Rule | form_management.create | Yes | src/components/registration-builder/FieldEditor.tsx | 530 |
| components/registration-builder/FormPreview | Previous | — | Yes | src/components/registration-builder/FormPreview.tsx | 102 |
| components/registration-builder/FormPreview | Next | — | Yes | src/components/registration-builder/FormPreview.tsx | 105 |
| components/registration-builder/FormPreview | Verify Email | — | No | src/components/registration-builder/FormPreview.tsx | 238 |
| components/registration-builder/FullRegistrationPreview | Send Code | form_management.edit | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 143 |
| components/registration-builder/FullRegistrationPreview | Previous | — | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 265 |
| components/registration-builder/FullRegistrationPreview | Next | — | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 271 |
| components/registration-builder/RegistrationFormBuilderEditor | Preview | form_management.view | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 106 |
| components/registration-builder/RegistrationFormBuilderEditor | Add Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 109 |
| components/registration-builder/RegistrationFormBuilderEditor | Add First Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 119 |
| components/registration-builder/RegistrationFormBuilderEditor | Add Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 170 |
| components/registration/DocumentsStep | View | registration_management.view | Yes | src/components/registration/DocumentsStep.tsx | 267 |
| components/registration/DocumentsStep | Download | registration_management.view | Yes | src/components/registration/DocumentsStep.tsx | 268 |
| components/registration/DocumentsStep | Replace | registration_management.edit | Yes | src/components/registration/DocumentsStep.tsx | 269 |
| components/registration/DocumentsStep | Remove | registration_management.edit | Yes | src/components/registration/DocumentsStep.tsx | 270 |
| components/registration/EmailVerificationSection | Send Verification Code | registration_management.create | Yes | src/components/registration/EmailVerificationSection.tsx | 137 |
| components/registration/EmailVerificationSection | {cooldown > 0 ? `Resend in $ s` : 'Resend Code'} | registration_management.create | Yes | src/components/registration/EmailVerificationSection.tsx | 161 |
| components/registration/PendingAuthorityScreen | Check status | — | No | src/components/registration/PendingAuthorityScreen.tsx | 53 |
| components/registration/RegistrationStepRenderer | Remove | registration_management.edit | Yes | src/components/registration/RegistrationStepRenderer.tsx | 172 |
| components/registration/RegistrationStepRenderer | + Add another | — | Yes | src/components/registration/RegistrationStepRenderer.tsx | 195 |
| components/registration/RegistrationStepRenderer | Remove | registration_management.edit | Yes | src/components/registration/RegistrationStepRenderer.tsx | 881 |
| components/registration/RegistrationStepRenderer | {uploading ? ( Uploading... ) : ( )} | registration_management.create | Yes | src/components/registration/RegistrationStepRenderer.tsx | 900 |
| components/returns/NotificationDispatchDetailDrawer | Technical details | — | No | src/components/returns/NotificationDispatchDetailDrawer.tsx | 198 |
| components/returns/NotificationDispatchDetailDrawer | Payload | — | No | src/components/returns/NotificationDispatchDetailDrawer.tsx | 234 |
| components/returns/NotificationDispatchDetailDrawer | Copy | — | Yes | src/components/returns/NotificationDispatchDetailDrawer.tsx | 238 |
| components/returns/ReturnReviewPanel | Go to form | — | Yes | src/components/returns/ReturnReviewPanel.tsx | 61 |
| components/returns/ReturnReviewPanel | Acknowledge & Submit | returns_management.edit | Yes | src/components/returns/ReturnReviewPanel.tsx | 187 |
| components/returns/ReturnUploadPanel | Download XLSX Template | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 298 |
| components/returns/ReturnUploadPanel | Download XML Template | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 302 |
| components/returns/ReturnUploadPanel | Discard | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 360 |
| components/settings/integrations/RetryQueuePanel | Refresh | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 332 |
| components/settings/integrations/RetryQueuePanel | Run worker now | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 336 |
| components/settings/integrations/RetryQueuePanel | Export | — | No | src/components/settings/integrations/RetryQueuePanel.tsx | 423 |
| components/settings/integrations/RetryQueuePanel | Retry selected ( ) | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 434 |
| components/settings/integrations/RetryQueuePanel | View | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 509 |
| components/settings/integrations/RetryQueuePanel | Retry | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 514 |
| components/settings/integrations/RetryQueuePanel | Export | — | No | src/components/settings/integrations/RetryQueuePanel.tsx | 547 |
| components/settings/integrations/RetryQueuePanel | View | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 607 |
| components/settings/integrations/RetryQueuePanel | Retry | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 612 |
| components/settings/integrations/RetryQueuePanel | Cancel | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 726 |
| components/settings/integrations/RetryQueuePanel | Confirm | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 729 |
| components/shared/AccessDenied | Go to Dashboard | — | Yes | src/components/shared/AccessDenied.tsx | 31 |
| components/shared/BatchDocumentUpload | Add files | settings.create | Yes | src/components/shared/BatchDocumentUpload.tsx | 181 |
| components/shared/BatchDocumentUpload | Upload {staged.length > 0 ? `($ )` : ''} | settings.edit | Yes | src/components/shared/BatchDocumentUpload.tsx | 189 |
| components/shared/CaptchaWidget | Retry security verification | — | No | src/components/shared/CaptchaWidget.tsx | 259 |
| components/shared/DataTableShell | Export | report_management.export | Yes | src/components/shared/DataTableShell.tsx | 92 |
| components/shared/ErrorBoundary | Try again | — | Yes | src/components/shared/ErrorBoundary.tsx | 76 |
| components/shared/ErrorBoundary | Reload page | — | Yes | src/components/shared/ErrorBoundary.tsx | 79 |
| components/supervision/ThematicClosurePanel | New version | — | No | src/components/supervision/ThematicClosurePanel.tsx | 180 |
| components/supervision/ThematicClosurePanel | Print / PDF | — | No | src/components/supervision/ThematicClosurePanel.tsx | 183 |
| components/supervision/ThematicClosurePanel | Prefill from findings & actions | prudential_supervision.edit | No | src/components/supervision/ThematicClosurePanel.tsx | 212 |
| components/supervision/ThematicClosurePanel | Save draft | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 213 |
| components/supervision/ThematicClosurePanel | Submit for approval | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 222 |
| components/supervision/ThematicClosurePanel | Approve report | prudential_supervision.approve | Yes | src/components/supervision/ThematicClosurePanel.tsx | 234 |
| components/supervision/ThematicClosurePanel | Reject | prudential_supervision.approve | Yes | src/components/supervision/ThematicClosurePanel.tsx | 238 |
| components/supervision/ThematicClosurePanel | Publish report & generate supervisory letters | prudential_supervision.approve | Yes | src/components/supervision/ThematicClosurePanel.tsx | 246 |
| components/supervision/ThematicClosurePanel | Mark dispatched | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 283 |
| components/supervision/ThematicClosurePanel | Cancel | — | Yes | src/components/supervision/ThematicClosurePanel.tsx | 314 |
| components/supervision/ThematicClosurePanel | Reject report | — | No | src/components/supervision/ThematicClosurePanel.tsx | 315 |
| components/supervision/ThematicClosurePanel | Submit for closure approval | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 391 |
| components/supervision/ThematicClosurePanel | Approve closure | prudential_supervision.approve | Yes | src/components/supervision/ThematicClosurePanel.tsx | 409 |
| components/supervision/ThematicClosurePanel | Reject closure | prudential_supervision.approve | Yes | src/components/supervision/ThematicClosurePanel.tsx | 413 |
| components/supervision/ThematicClosurePanel | Cancel | — | Yes | src/components/supervision/ThematicClosurePanel.tsx | 426 |
| components/supervision/ThematicClosurePanel | Reject closure | — | No | src/components/supervision/ThematicClosurePanel.tsx | 427 |
| components/supervision/ThematicFollowUpRegister | Verify | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 101 |
| components/supervision/ThematicFollowUpRegister | Extend | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 105 |
| components/supervision/ThematicFollowUpRegister | Cancel | — | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 141 |
| components/supervision/ThematicFollowUpRegister | Save verification | — | No | src/components/supervision/ThematicFollowUpRegister.tsx | 142 |
| components/supervision/ThematicFollowUpRegister | Cancel | — | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 163 |
| components/supervision/ThematicFollowUpRegister | Extend | — | No | src/components/supervision/ThematicFollowUpRegister.tsx | 164 |
| components/supervision/ThematicFollowUpRegister | Cancel | — | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 182 |
| components/supervision/ThematicFollowUpRegister | Save | — | No | src/components/supervision/ThematicFollowUpRegister.tsx | 183 |
| components/ui/carousel | Previous slide | — | Yes | src/components/ui/carousel.tsx | 173 |
| components/ui/carousel | Next slide | — | Yes | src/components/ui/carousel.tsx | 201 |
| components/ui/multi-select | {selected.length === 0 && ( )} {selectedLabels.map((label, i) => ( ))} | settings.view | Yes | src/components/ui/multi-select.tsx | 66 |
| components/ui/sidebar | Toggle Sidebar | — | Yes | src/components/ui/sidebar.tsx | 224 |
| components/workflows/ActionNotificationsEditor | Add Notification | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 296 |
| components/workflows/ActionNotificationsEditor | Edit | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 367 |
| components/workflows/ActionNotificationsEditor | Cancel | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 536 |
| components/workflows/ActionNotificationsEditor | Save | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 544 |
| components/workflows/ActionNotificationsEditor | Cancel | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 747 |
| components/workflows/ActionNotificationsEditor | Save | workflow_management.edit | Yes | src/components/workflows/ActionNotificationsEditor.tsx | 755 |
| components/workflows/StepActionsEditor | Add Action | workflow_management.edit | Yes | src/components/workflows/StepActionsEditor.tsx | 208 |
| components/workflows/StepActionsEditor | Cancel | — | Yes | src/components/workflows/StepActionsEditor.tsx | 546 |
| components/workflows/StepActionsEditor | Replace | workflow_management.edit | Yes | src/components/workflows/StepActionsEditor.tsx | 653 |
| components/workflows/StepActionsEditor | Download | workflow_management.view | Yes | src/components/workflows/StepActionsEditor.tsx | 659 |
| components/workflows/StepActionsEditor | Remove | workflow_management.edit | Yes | src/components/workflows/StepActionsEditor.tsx | 665 |
| components/workflows/StepActionsEditor | Upload Signature | workflow_management.edit | Yes | src/components/workflows/StepActionsEditor.tsx | 675 |
| components/workflows/StepEntryNotificationsEditor | Add | workflow_management.edit | Yes | src/components/workflows/StepEntryNotificationsEditor.tsx | 149 |
| components/workflows/StepEntryNotificationsEditor | Cancel | — | Yes | src/components/workflows/StepEntryNotificationsEditor.tsx | 300 |
| components/workflows/WorkflowVersionPanel | History ( ) | workflow_management.edit | Yes | src/components/workflows/WorkflowVersionPanel.tsx | 94 |
| components/workflows/WorkflowVersionPanel | Publish New Version | workflow_management.create | Yes | src/components/workflows/WorkflowVersionPanel.tsx | 103 |
| components/workflows/WorkflowVersionPanel | Cancel | — | Yes | src/components/workflows/WorkflowVersionPanel.tsx | 146 |
| components/workflows/WorkflowVersionPanel | Close | — | Yes | src/components/workflows/WorkflowVersionPanel.tsx | 214 |
| pages/admin/ApiKeys | Issue key | settings.edit | Yes | src/pages/admin/ApiKeys.tsx | 97 |
| pages/admin/ApiKeys | Revoke | user_management.edit | Yes | src/pages/admin/ApiKeys.tsx | 155 |
| pages/admin/ApiKeys | Copy | settings.edit | Yes | src/pages/admin/ApiKeys.tsx | 216 |
| pages/admin/ApiKeys | Done | settings.edit | Yes | src/pages/admin/ApiKeys.tsx | 234 |
| pages/admin/ApiKeys | Issue key | settings.edit | Yes | src/pages/admin/ApiKeys.tsx | 235 |
| pages/admin/ApprovedLicensees | Export | licensee_management.export | Yes | src/pages/admin/ApprovedLicensees.tsx | 148 |
| pages/admin/ApprovedLicensees | Generate License | license_management.create | Yes | src/pages/admin/ApprovedLicensees.tsx | 236 |
| pages/admin/ApprovedLicensees | View | — | Yes | src/pages/admin/ApprovedLicensees.tsx | 250 |
| pages/admin/AuditExport | Run export | audit_management.export | Yes | src/pages/admin/AuditExport.tsx | 153 |
| pages/admin/AuditExport | CSV | audit_management.export | Yes | src/pages/admin/AuditExport.tsx | 199 |
| pages/admin/AuditLogs | Clear filters | — | Yes | src/pages/admin/AuditLogs.tsx | 152 |
| pages/admin/AuditLogs | View | — | Yes | src/pages/admin/AuditLogs.tsx | 218 |
| pages/admin/AuditLogs | Load more ( remaining) | — | Yes | src/pages/admin/AuditLogs.tsx | 235 |
| pages/admin/BulkIntake | CSV Template | application_management.import | Yes | src/pages/admin/BulkIntake.tsx | 185 |
| pages/admin/BulkIntake | Validate | application_management.import | Yes | src/pages/admin/BulkIntake.tsx | 230 |
| pages/admin/BulkIntake | Commit {okCount > 0 ? `($ )` : ''} | application_management.import | Yes | src/pages/admin/BulkIntake.tsx | 234 |
| pages/admin/CaseAuditTrail | Load | audit_management.export | Yes | src/pages/admin/CaseAuditTrail.tsx | 115 |
| pages/admin/CaseAuditTrail | Export JSON | audit_management.export | Yes | src/pages/admin/CaseAuditTrail.tsx | 127 |
| pages/admin/ChangeActiveSector | Cancel | settings.edit | Yes | src/pages/admin/ChangeActiveSector.tsx | 66 |
| pages/admin/ChangeActiveSector | Save Sector | settings.edit | Yes | src/pages/admin/ChangeActiveSector.tsx | 67 |
| pages/admin/ComplaintTypes | Add Type | complaint_type.create | Yes | src/pages/admin/ComplaintTypes.tsx | 105 |
| pages/admin/ComplaintTypes | Add First Type | complaint_type.create | Yes | src/pages/admin/ComplaintTypes.tsx | 121 |
| pages/admin/ComplaintTypes | Edit | complaint_type.edit | Yes | src/pages/admin/ComplaintTypes.tsx | 150 |
| pages/admin/ComplianceAuditLogs | Apply Filters | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 335 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 338 |
| pages/admin/ComplianceAuditLogs | Trace | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 424 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 427 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 514 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 554 |
| pages/admin/conduct/MonitoringRules | Run now | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 112 |
| pages/admin/conduct/MonitoringRules | New rule | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 113 |
| pages/admin/conduct/MonitoringRules | Versions | market_conduct.edit | No | src/pages/admin/conduct/MonitoringRules.tsx | 144 |
| pages/admin/conduct/MonitoringRules | Edit | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 145 |
| pages/admin/conduct/MonitoringRules | Cancel | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 195 |
| pages/admin/conduct/MonitoringRules | Save | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 196 |
| pages/admin/conduct/ProductsChannels | Add Product | market_conduct.create | Yes | src/pages/admin/conduct/ProductsChannels.tsx | 90 |
| pages/admin/conduct/ProductsChannels | Add Channel | market_conduct.create | Yes | src/pages/admin/conduct/ProductsChannels.tsx | 181 |
| pages/admin/conduct/RiskTaxonomy | Add Category | market_conduct.create | Yes | src/pages/admin/conduct/RiskTaxonomy.tsx | 85 |
| pages/admin/conduct/TriageRules | Simulate | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 234 |
| pages/admin/conduct/TriageRules | Add Rule | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 235 |
| pages/admin/conduct/TriageRules | Add | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 351 |
| pages/admin/CorrespondenceTemplates | New template | settings.create | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 117 |
| pages/admin/CorrespondenceTemplates | Cancel | settings.edit | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 190 |
| pages/admin/CorrespondenceTemplates | Save | settings.edit | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 191 |
| pages/admin/DecisionOptions | New Option | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 102 |
| pages/admin/DecisionOptions | New Template | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 128 |
| pages/admin/DecisionOptions | Cancel | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 191 |
| pages/admin/DecisionOptions | Save | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 191 |
| pages/admin/DecisionOptions | Cancel | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 216 |
| pages/admin/DecisionOptions | Save | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 216 |
| pages/admin/EntityMemberships | Verify | — | No | src/pages/admin/EntityMemberships.tsx | 129 |
| pages/admin/EntityMemberships | Approve | — | No | src/pages/admin/EntityMemberships.tsx | 135 |
| pages/admin/EntityMemberships | Reject | — | No | src/pages/admin/EntityMemberships.tsx | 141 |
| pages/admin/EntityMemberships | Revoke | — | No | src/pages/admin/EntityMemberships.tsx | 150 |
| pages/admin/FeeManagement | Add Fee | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 515 |
| pages/admin/FeeManagement | Add Rule | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 782 |
| pages/admin/FeeManagement | Add Fee Type | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 933 |
| pages/admin/FormBuilder | Preview | — | Yes | src/pages/admin/FormBuilder.tsx | 662 |
| pages/admin/FormManagement | Import from Excel | form_management.import | Yes | src/pages/admin/FormManagement.tsx | 378 |
| pages/admin/FormManagement | Add Form | form_management.create | Yes | src/pages/admin/FormManagement.tsx | 393 |
| pages/admin/FormManagement | Open Registration Form Builder | — | Yes | src/pages/admin/FormManagement.tsx | 417 |
| pages/admin/FormManagement | Publish Selected | form_management.publish | Yes | src/pages/admin/FormManagement.tsx | 486 |
| pages/admin/FormManagement | Unpublish Selected | form_management.edit | Yes | src/pages/admin/FormManagement.tsx | 492 |
| pages/admin/FormManagement | Delete Selected | form_management.delete | Yes | src/pages/admin/FormManagement.tsx | 503 |
| pages/admin/FormManagement | Clear Selection | form_management.edit | Yes | src/pages/admin/FormManagement.tsx | 513 |
| pages/admin/FormsPackagesWorkspace | Create missing identities | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 84 |
| pages/admin/FormsPackagesWorkspace | New concept | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 97 |
| pages/admin/FormsPackagesWorkspace | Cancel | — | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 203 |
| pages/admin/FormsPackagesWorkspace | Create | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 204 |
| pages/admin/FormsPackagesWorkspace | New package | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 252 |
| pages/admin/FormsPackagesWorkspace | Add | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 300 |
| pages/admin/FormsPackagesWorkspace | Publish package | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 311 |
| pages/admin/FormsPackagesWorkspace | Cancel | — | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 386 |
| pages/admin/FormsPackagesWorkspace | Create | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 387 |
| pages/admin/FormsPackagesWorkspace | New rule | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 425 |
| pages/admin/FormsPackagesWorkspace | Resolve | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 487 |
| pages/admin/FormsPackagesWorkspace | Cancel | — | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 541 |
| pages/admin/FormsPackagesWorkspace | Save | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 542 |
| pages/admin/FormsPackagesWorkspace | Apply suggestion | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 636 |
| pages/admin/FormsPackagesWorkspace | Reconstruct from evidence | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 669 |
| pages/admin/FormsPackagesWorkspace | Mark legacy unknown | — | No | src/pages/admin/FormsPackagesWorkspace.tsx | 706 |
| pages/admin/FormTemplateView | Back to forms | form_management.edit | Yes | src/pages/admin/FormTemplateView.tsx | 63 |
| pages/admin/FormTemplateView | Back | form_management.edit | Yes | src/pages/admin/FormTemplateView.tsx | 79 |
| pages/admin/FormTemplateView | Open in new tab | form_management.edit | Yes | src/pages/admin/FormTemplateView.tsx | 83 |
| pages/admin/FormTemplateView | Edit | form_management.edit | Yes | src/pages/admin/FormTemplateView.tsx | 91 |
| pages/admin/FpCommittees | New committee | fit_and_proper_committee.create | Yes | src/pages/admin/FpCommittees.tsx | 153 |
| pages/admin/FpCommittees | Cancel | fit_and_proper_committee.create | Yes | src/pages/admin/FpCommittees.tsx | 166 |
| pages/admin/FpCommittees | Create | fit_and_proper_committee.create | Yes | src/pages/admin/FpCommittees.tsx | 167 |
| pages/admin/FpCommittees | Add | fit_and_proper_committee.edit | Yes | src/pages/admin/FpCommittees.tsx | 224 |
| pages/admin/FpScreeningConfigs | New rule | fit_and_proper.create | Yes | src/pages/admin/FpScreeningConfigs.tsx | 113 |
| pages/admin/FpScreeningConfigs | Cancel | fit_and_proper.edit | Yes | src/pages/admin/FpScreeningConfigs.tsx | 141 |
| pages/admin/FpScreeningConfigs | Save | fit_and_proper.edit | Yes | src/pages/admin/FpScreeningConfigs.tsx | 142 |
| pages/admin/FpSectorDecisionRules | New rule | fit_and_proper.create | Yes | src/pages/admin/FpSectorDecisionRules.tsx | 183 |
| pages/admin/FpSectorDecisionRules | Cancel | fit_and_proper.edit | Yes | src/pages/admin/FpSectorDecisionRules.tsx | 299 |
| pages/admin/FpSectorDecisionRules | Save | fit_and_proper.edit | Yes | src/pages/admin/FpSectorDecisionRules.tsx | 300 |
| pages/admin/LicenseActionFormsPage | New Mapping | license_management.create | Yes | src/pages/admin/LicenseActionFormsPage.tsx | 132 |
| pages/admin/LicenseActionFormsPage | Cancel | license_management.edit | Yes | src/pages/admin/LicenseActionFormsPage.tsx | 328 |
| pages/admin/LicenseActionFormsPage | Save | license_management.edit | Yes | src/pages/admin/LicenseActionFormsPage.tsx | 329 |
| pages/admin/LicenseAppealPanels | New panel | — | No | src/pages/admin/LicenseAppealPanels.tsx | 231 |
| pages/admin/LicenseAppealPanels | Cancel | — | Yes | src/pages/admin/LicenseAppealPanels.tsx | 351 |
| pages/admin/LicenseAppealPanels | Save | — | No | src/pages/admin/LicenseAppealPanels.tsx | 352 |
| pages/admin/LicenseeDetail | Back to Licensees | — | Yes | src/pages/admin/LicenseeDetail.tsx | 164 |
| pages/admin/ManageLicensees | View | — | Yes | src/pages/admin/ManageLicensees.tsx | 353 |
| pages/admin/ManageWebUsers | Add Web User | user_management.create | Yes | src/pages/admin/ManageWebUsers.tsx | 210 |
| pages/admin/ManageWebUsers | Cancel | — | Yes | src/pages/admin/ManageWebUsers.tsx | 256 |
| pages/admin/MasterConfiguration | Sample Excel | settings.edit | Yes | src/pages/admin/MasterConfiguration.tsx | 256 |
| pages/admin/MasterConfiguration | Import Excel | master_data_management.import | Yes | src/pages/admin/MasterConfiguration.tsx | 259 |
| pages/admin/MasterConfiguration | Add | settings.edit | Yes | src/pages/admin/MasterConfiguration.tsx | 262 |
| pages/admin/MasterConfiguration | Cancel | — | Yes | src/pages/admin/MasterConfiguration.tsx | 320 |
| pages/admin/MasterDataManagement | Add Type | settings.edit | Yes | src/pages/admin/MasterDataManagement.tsx | 222 |
| pages/admin/MasterDataManagement | Sample Excel | settings.export | Yes | src/pages/admin/MasterDataManagement.tsx | 255 |
| pages/admin/MasterDataManagement | Import Excel | master_data_management.import | Yes | src/pages/admin/MasterDataManagement.tsx | 258 |
| pages/admin/MasterDataManagement | Add Item | settings.edit | Yes | src/pages/admin/MasterDataManagement.tsx | 261 |
| pages/admin/MasterDataManagement | Cancel | — | Yes | src/pages/admin/MasterDataManagement.tsx | 308 |
| pages/admin/MasterDataManagement | Cancel | — | Yes | src/pages/admin/MasterDataManagement.tsx | 357 |
| pages/admin/ModuleRuleTester | Back to Rule Library | — | Yes | src/pages/admin/ModuleRuleTester.tsx | 26 |
| pages/admin/ModuleRuleTester | Rule Library | — | No | src/pages/admin/ModuleRuleTester.tsx | 43 |
| pages/admin/NotificationChannelHealth | Try again | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 66 |
| pages/admin/NotificationChannelHealth | Refresh | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 84 |
| pages/admin/NotificationChannelHealth | Resend | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 229 |
| pages/admin/NotificationEvents | New event | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 224 |
| pages/admin/NotificationEvents | Configure | — | No | src/pages/admin/NotificationEvents.tsx | 286 |
| pages/admin/NotificationEvents | Add rule | — | No | src/pages/admin/NotificationEvents.tsx | 463 |
| pages/admin/NotificationEvents | Cancel | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 566 |
| pages/admin/NotificationEvents | Save configuration | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 567 |
| pages/admin/NotificationHistory | Refresh | — | Yes | src/pages/admin/NotificationHistory.tsx | 129 |
| pages/admin/NotificationHistory | Resend | — | Yes | src/pages/admin/NotificationHistory.tsx | 224 |
| pages/admin/NotificationHistory | Previous | — | Yes | src/pages/admin/NotificationHistory.tsx | 246 |
| pages/admin/NotificationHistory | Next | — | Yes | src/pages/admin/NotificationHistory.tsx | 250 |
| pages/admin/NotificationTemplates | New template | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 252 |
| pages/admin/NotificationTemplates | {`{{$ }}`} | notification_management.manage_templates | No | src/pages/admin/NotificationTemplates.tsx | 392 |
| pages/admin/NotificationTemplates | Cancel | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 417 |
| pages/admin/NotificationTemplates | Save draft | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 418 |
| pages/admin/NotificationTemplates | Close | — | Yes | src/pages/admin/NotificationTemplates.tsx | 456 |
| pages/admin/OperatingStructure | Advanced | — | No | src/pages/admin/OperatingStructure.tsx | 60 |
| pages/admin/PermissionCatalogTab | Module | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 101 |
| pages/admin/PermissionCatalogTab | Action | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 146 |
| pages/admin/PermissionCatalogTab | Cancel | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 343 |
| pages/admin/PermissionCatalogTab | Save | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 344 |
| pages/admin/PermissionCatalogTab | Cancel | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 385 |
| pages/admin/PermissionCatalogTab | Save | role_management.manage_catalog | Yes | src/pages/admin/PermissionCatalogTab.tsx | 386 |
| pages/admin/PostLicenseForms | Add Post-License Form | form_management.create | Yes | src/pages/admin/PostLicenseForms.tsx | 131 |
| pages/admin/PostLicensingApplications | New Application | form_management.create | Yes | src/pages/admin/PostLicensingApplications.tsx | 114 |
| pages/admin/PostLicensingApplications | Cancel | form_management.edit | Yes | src/pages/admin/PostLicensingApplications.tsx | 154 |
| pages/admin/PostLicensingApplications | Update | form_management.edit | Yes | src/pages/admin/PostLicensingApplications.tsx | 155 |
| pages/admin/PpocManagement | Add Mapping | user_management.create | Yes | src/pages/admin/PpocManagement.tsx | 337 |
| pages/admin/PpocManagement | Cancel | — | Yes | src/pages/admin/PpocManagement.tsx | 487 |
| pages/admin/PreLicenseForms | Add Pre-License Form | form_management.create | Yes | src/pages/admin/PreLicenseForms.tsx | 131 |
| pages/admin/PrudentialEngineOperations | {busy ? 'Running…' : `Run $ `} | — | Yes | src/pages/admin/PrudentialEngineOperations.tsx | 75 |
| pages/admin/RegistrationFormBuilder | Create Configuration | form_management.create | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 466 |
| pages/admin/RegistrationFormBuilder | Add Document Type | form_management.edit | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 748 |
| pages/admin/RegistrationFormBuilder | Add Declaration | form_management.edit | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 810 |
| pages/admin/RegistrationFormBuilder | Cancel | form_management.view | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 818 |
| pages/admin/RegistrationFormBuilder | Preview | form_management.view | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 819 |
| pages/admin/RegistrationReview | Open Review | — | Yes | src/pages/admin/RegistrationReview.tsx | 256 |
| pages/admin/RegistrationReviewDetail | Retry | — | Yes | src/pages/admin/RegistrationReviewDetail.tsx | 381 |
| pages/admin/RegulatorManagement | Add Regulator | user_management.create | Yes | src/pages/admin/RegulatorManagement.tsx | 200 |
| pages/admin/RegulatorManagement | Cancel | — | Yes | src/pages/admin/RegulatorManagement.tsx | 279 |
| pages/admin/ReturnConfiguration | Add Configuration | returns_management.configure | Yes | src/pages/admin/ReturnConfiguration.tsx | 112 |
| pages/admin/returns/CutoffConfigPage | Add Cutoff | returns_management.create | Yes | src/pages/admin/returns/CutoffConfigPage.tsx | 50 |
| pages/admin/returns/DueDatesPage | Preview | returns_management.edit | Yes | src/pages/admin/returns/DueDatesPage.tsx | 132 |
| pages/admin/returns/DueDatesPage | {generating ? 'Generating...' : `Generate $ Due Dates`} | returns_management.edit | Yes | src/pages/admin/returns/DueDatesPage.tsx | 133 |
| pages/admin/returns/LateFeesPage | Add Fee Structure | returns_management.create | Yes | src/pages/admin/returns/LateFeesPage.tsx | 56 |
| pages/admin/returns/LateFeesPage | Add | returns_management.edit | Yes | src/pages/admin/returns/LateFeesPage.tsx | 166 |
| pages/admin/returns/ReturnConfigsPage | Add Configuration | returns_management.create | Yes | src/pages/admin/returns/ReturnConfigsPage.tsx | 65 |
| pages/admin/returns/ReturnConfigsPage | Cancel | — | Yes | src/pages/admin/returns/ReturnConfigsPage.tsx | 249 |
| pages/admin/returns/ReturnTypesPage | Add Return Type | returns_management.create | Yes | src/pages/admin/returns/ReturnTypesPage.tsx | 46 |
| pages/admin/RfiAutoRules | New rule | application_management.create | Yes | src/pages/admin/RfiAutoRules.tsx | 195 |
| pages/admin/RfiAutoRules | Cancel | application_management.edit | Yes | src/pages/admin/RfiAutoRules.tsx | 533 |
| pages/admin/RfiAutoRules | Save rule | application_management.edit | Yes | src/pages/admin/RfiAutoRules.tsx | 536 |
| pages/admin/RoleManagement | Classify existing roles | role_management.create | No | src/pages/admin/RoleManagement.tsx | 666 |
| pages/admin/RoleManagement | Create Role | role_management.create | Yes | src/pages/admin/RoleManagement.tsx | 671 |
| pages/admin/RoleManagement | Cancel | — | Yes | src/pages/admin/RoleManagement.tsx | 1296 |
| pages/admin/RoleManagement | Cancel | — | Yes | src/pages/admin/RoleManagement.tsx | 1317 |
| pages/admin/RuleEditor | Library | rule_engine.edit | No | src/pages/admin/RuleEditor.tsx | 240 |
| pages/admin/RuleEditor | Test rule | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 243 |
| pages/admin/RuleEditor | Save draft | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 246 |
| pages/admin/RuleEditor | Activate | rule_engine.activate | Yes | src/pages/admin/RuleEditor.tsx | 250 |
| pages/admin/RuleEditor | Add condition | — | No | src/pages/admin/RuleEditor.tsx | 474 |
| pages/admin/RuleEditor | Add action | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 600 |
| pages/admin/RuleEditor | View execution history | — | Yes | src/pages/admin/RuleEditor.tsx | 688 |
| pages/admin/RuleLibrary | Export | rule_engine.export | Yes | src/pages/admin/RuleLibrary.tsx | 201 |
| pages/admin/RuleLibrary | New Rule | rule_engine.edit | Yes | src/pages/admin/RuleLibrary.tsx | 204 |
| pages/admin/RuleLibrary | Reset filters | — | No | src/pages/admin/RuleLibrary.tsx | 298 |
| pages/admin/RuleLibrary | Previous | — | Yes | src/pages/admin/RuleLibrary.tsx | 425 |
| pages/admin/RuleLibrary | Next | — | Yes | src/pages/admin/RuleLibrary.tsx | 426 |
| pages/admin/RuleLibrary | Open module configuration | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 447 |
| pages/admin/RuleLibrary | Cancel | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 471 |
| pages/admin/RuleLibrary | Deactivate | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 472 |
| pages/admin/RuleOverrides | View full entity timeline | — | Yes | src/pages/admin/RuleOverrides.tsx | 256 |
| pages/admin/SecurityEvents | Refresh | audit_management.export | Yes | src/pages/admin/SecurityEvents.tsx | 172 |
| pages/admin/SecurityEvents | Export CSV | audit_management.export | Yes | src/pages/admin/SecurityEvents.tsx | 176 |
| pages/admin/SlaManager | Workflow Designer | workflow_management.view | Yes | src/pages/admin/SlaManager.tsx | 120 |
| pages/admin/SlaManager | Add SLA | workflow_management.edit | Yes | src/pages/admin/SlaManager.tsx | 325 |
| pages/admin/SlaManager | Import CSV | settings.import | Yes | src/pages/admin/SlaManager.tsx | 722 |
| pages/admin/SlaManager | Save Calendar | workflow_management.edit | Yes | src/pages/admin/SlaManager.tsx | 751 |
| pages/admin/SlaManager | Open DASH-OPS | — | Yes | src/pages/admin/SlaManager.tsx | 953 |
| pages/admin/SlaManager | Refresh | — | Yes | src/pages/admin/SlaManager.tsx | 1139 |
| pages/admin/SufficiencyRules | New Rule | application_management.create | Yes | src/pages/admin/SufficiencyRules.tsx | 103 |
| pages/admin/SufficiencyRules | Cancel | application_management.edit | Yes | src/pages/admin/SufficiencyRules.tsx | 202 |
| pages/admin/SufficiencyRules | Save | application_management.edit | Yes | src/pages/admin/SufficiencyRules.tsx | 203 |
| pages/admin/SufficiencyRuleSets | New Rule Set | application_management.create | Yes | src/pages/admin/SufficiencyRuleSets.tsx | 105 |
| pages/admin/SufficiencyRuleSets | Cancel | application_management.edit | Yes | src/pages/admin/SufficiencyRuleSets.tsx | 152 |
| pages/admin/SufficiencyRuleSets | Save | application_management.configure | Yes | src/pages/admin/SufficiencyRuleSets.tsx | 152 |
| pages/admin/SupervisoryPlanTemplates | New template | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 119 |
| pages/admin/SupervisoryPlanTemplates | Add action | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 164 |
| pages/admin/SupervisoryPlanTemplates | Cancel | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 204 |
| pages/admin/SupervisoryPlanTemplates | Save | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 205 |
| pages/admin/SupervisoryPlanTemplates | Cancel | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 271 |
| pages/admin/SupervisoryPlanTemplates | Save | application_management.edit | Yes | src/pages/admin/SupervisoryPlanTemplates.tsx | 272 |
| pages/admin/SupportQueue | Assign to me | — | No | src/pages/admin/SupportQueue.tsx | 253 |
| pages/admin/SupportQueue | Save notes | — | No | src/pages/admin/SupportQueue.tsx | 350 |
| pages/admin/SupportQueue | Mark resolved | — | No | src/pages/admin/SupportQueue.tsx | 354 |
| pages/admin/SupportQueue | Close ticket | — | No | src/pages/admin/SupportQueue.tsx | 359 |
| pages/admin/UserManagement | Create Employee | user_management.create | Yes | src/pages/admin/UserManagement.tsx | 515 |
| pages/admin/UserManagement | Choose Image | user_management.edit | Yes | src/pages/admin/UserManagement.tsx | 603 |
| pages/admin/UserManagement | Remove | user_management.delete | Yes | src/pages/admin/UserManagement.tsx | 607 |
| pages/admin/UserManagement | Cancel | — | Yes | src/pages/admin/UserManagement.tsx | 664 |
| pages/admin/UserManagement | Done | — | Yes | src/pages/admin/UserManagement.tsx | 703 |
| pages/admin/UserManagement | Cancel | — | Yes | src/pages/admin/UserManagement.tsx | 745 |
| pages/admin/UserManagement | Cancel | — | Yes | src/pages/admin/UserManagement.tsx | 773 |
| pages/admin/UserManagement | Remove | user_management.delete | Yes | src/pages/admin/UserManagement.tsx | 812 |
| pages/admin/UserManagement | Cancel | — | Yes | src/pages/admin/UserManagement.tsx | 860 |
| pages/admin/WorkflowConfig | New Workflow | workflow_management.create | Yes | src/pages/admin/WorkflowConfig.tsx | 67 |
| pages/admin/WorkflowConfig | Edit | workflow_management.edit | Yes | src/pages/admin/WorkflowConfig.tsx | 112 |
| pages/analytics/AiInsightsHub | Accept | analytics.edit | Yes | src/pages/analytics/AiInsightsHub.tsx | 160 |
| pages/analytics/AiInsightsHub | Reject | analytics.edit | Yes | src/pages/analytics/AiInsightsHub.tsx | 161 |
| pages/analytics/AiInsightsHub | Escalate | analytics.edit | Yes | src/pages/analytics/AiInsightsHub.tsx | 162 |
| pages/analytics/SupervisoryAiReports | View Report | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 156 |
| pages/analytics/SupervisoryAiReports | Try again | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 263 |
| pages/analytics/SupervisoryAiReports | Clear filters | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 431 |
| pages/analytics/SupervisoryAiReports | More filters {!moreOpen && advancedActive > 0 && ( )} | — | No | src/pages/analytics/SupervisoryAiReports.tsx | 641 |
| pages/analytics/SupervisoryAiReports | Clear filters | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 658 |
| pages/appeals/MyAppeals | Try again | — | Yes | src/pages/appeals/MyAppeals.tsx | 91 |
| pages/appeals/MyAppeals | View application | — | Yes | src/pages/appeals/MyAppeals.tsx | 131 |
| pages/appeals/MyAppeals | Lodge an appeal | — | No | src/pages/appeals/MyAppeals.tsx | 134 |
| pages/appeals/MyAppeals | View my applications | — | Yes | src/pages/appeals/MyAppeals.tsx | 155 |
| pages/appeals/MyAppeals | Open related application | — | Yes | src/pages/appeals/MyAppeals.tsx | 208 |
| pages/ApplicationForms | Review Entered Data | application_management.edit | Yes | src/pages/ApplicationForms.tsx | 499 |
| pages/ApplicationForms | Review & Submit | application_management.edit | Yes | src/pages/ApplicationForms.tsx | 508 |
| pages/ApplicationForms | Back to Forms | — | Yes | src/pages/ApplicationForms.tsx | 555 |
| pages/applications/ApplicationDetail | Cancel Application | application_management.edit | No | src/pages/applications/ApplicationDetail.tsx | 1260 |
| pages/applications/ApplicationDetail | Request Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1268 |
| pages/applications/ApplicationDetail | Allow Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1428 |
| pages/applications/ApplicationDetail | Deny Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1432 |
| pages/applications/ApplicationDetail | {processing ? 'Submitting...' : !taxonomyComplete ? 'Select sector, sub-sector a | application_management.create | Yes | src/pages/applications/ApplicationDetail.tsx | 1567 |
| pages/applications/ApplicationDetail | Cancel | — | Yes | src/pages/applications/ApplicationDetail.tsx | 1597 |
| pages/applications/ApplicationDetail | View Payment Details | — | Yes | src/pages/applications/ApplicationDetail.tsx | 1659 |
| pages/applications/ApplicationQueue | Triage {selected.size > 0 ? `($ )` : ''} | — | No | src/pages/applications/ApplicationQueue.tsx | 217 |
| pages/applications/ApplicationQueue | {t.countKey && counts ? ( ) : null} | — | No | src/pages/applications/ApplicationQueue.tsx | 243 |
| pages/applications/ApplicationQueue | Previous | — | Yes | src/pages/applications/ApplicationQueue.tsx | 491 |
| pages/applications/ApplicationQueue | Next | — | Yes | src/pages/applications/ApplicationQueue.tsx | 500 |
| pages/applications/ApplicationQueue | Cancel | — | Yes | src/pages/applications/ApplicationQueue.tsx | 552 |
| pages/applications/ApplicationQueue | Apply | — | Yes | src/pages/applications/ApplicationQueue.tsx | 553 |
| pages/applications/ApplicationsList | · | application_management.view | Yes | src/pages/applications/ApplicationsList.tsx | 845 |
| pages/applications/ApplicationsList | New Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1260 |
| pages/applications/ApplicationsList | New Pre-Licensee Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1266 |
| pages/applications/ApplicationsList | New Post-Licensee Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1269 |
| pages/applications/ApplicationsList | New Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1275 |
| pages/applications/ApplicationsList | Clear filter | — | Yes | src/pages/applications/ApplicationsList.tsx | 1297 |
| pages/applications/ApplicationsList | Export CSV | application_management.export | Yes | src/pages/applications/ApplicationsList.tsx | 1382 |
| pages/applications/ApplicationsList | Compare submissions | application_management.view | Yes | src/pages/applications/ApplicationsList.tsx | 1410 |
| pages/applications/ApplicationsList | Cancel | — | Yes | src/pages/applications/ApplicationsList.tsx | 1418 |
| pages/applications/ApplicationsList | Cancel | — | Yes | src/pages/applications/ApplicationsList.tsx | 1637 |
| pages/applications/ApplicationsList | Open comparison | — | Yes | src/pages/applications/ApplicationsList.tsx | 1638 |
| pages/billing/Penalties | Case | — | Yes | src/pages/billing/Penalties.tsx | 120 |
| pages/complaints/BulkIntake | Process batch | complaint_management.edit | Yes | src/pages/complaints/BulkIntake.tsx | 96 |
| pages/complaints/BulkIntake | Rows | — | No | src/pages/complaints/BulkIntake.tsx | 132 |
| pages/complaints/ComplaintDetail | Reprint acknowledgement | complaint_management.edit | Yes | src/pages/complaints/ComplaintDetail.tsx | 339 |
| pages/complaints/ComplaintDetail | Back to Complaints | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 342 |
| pages/complaints/ComplaintDetail | Return to current step | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 597 |
| pages/complaints/ComplaintDetail | Override | complaint_management.edit | Yes | src/pages/complaints/ComplaintDetail.tsx | 651 |
| pages/complaints/ComplaintDetail | View | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 749 |
| pages/complaints/ComplaintsAnalytics | Back to List | — | Yes | src/pages/complaints/ComplaintsAnalytics.tsx | 47 |
| pages/complaints/ComplaintsList | Analytics | complaint_management.view | Yes | src/pages/complaints/ComplaintsList.tsx | 560 |
| pages/complaints/ComplaintsList | Bulk intake | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 563 |
| pages/complaints/ComplaintsList | New Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 566 |
| pages/complaints/ComplaintsList | Track Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 572 |
| pages/complaints/ComplaintsList | File Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 579 |
| pages/complaints/ComplaintsList | More filters | — | Yes | src/pages/complaints/ComplaintsList.tsx | 658 |
| pages/complaints/ComplaintsList | View | — | Yes | src/pages/complaints/ComplaintsList.tsx | 810 |
| pages/complaints/ComplaintsList | Track | — | Yes | src/pages/complaints/ComplaintsList.tsx | 813 |
| pages/complaints/ComplaintsList | Open detail | — | Yes | src/pages/complaints/ComplaintsList.tsx | 925 |
| pages/complaints/ComplaintsList | Reprint acknowledgement | complaint_management.view | Yes | src/pages/complaints/ComplaintsList.tsx | 928 |
| pages/complaints/ComplaintsList | Run / retry triage | complaint_management.edit | Yes | src/pages/complaints/ComplaintsList.tsx | 931 |
| pages/complaints/ComplaintsList | View | — | Yes | src/pages/complaints/ComplaintsList.tsx | 1028 |
| pages/complaints/duplicates/DuplicateDetectionHub | Run detection | complaint_management.edit | Yes | src/pages/complaints/duplicates/DuplicateDetectionHub.tsx | 52 |
| pages/complaints/duplicates/DuplicateDetectionHub | Back to Complaints | — | Yes | src/pages/complaints/duplicates/DuplicateDetectionHub.tsx | 56 |
| pages/complaints/escalations/EscalationHub | Run sweep now | complaint_management.edit | Yes | src/pages/complaints/escalations/EscalationHub.tsx | 70 |
| pages/complaints/escalations/EscalationQueueTable | Ack | complaint_management.edit | Yes | src/pages/complaints/escalations/EscalationQueueTable.tsx | 130 |
| pages/complaints/escalations/EscalationQueueTable | Escalate | complaint_management.escalate | Yes | src/pages/complaints/escalations/EscalationQueueTable.tsx | 133 |
| pages/complaints/escalations/EscalationQueueTable | Dismiss | complaint_management.edit | Yes | src/pages/complaints/escalations/EscalationQueueTable.tsx | 136 |
| pages/complaints/escalations/EscalationRulesAdmin | Save changes | complaint_management.edit | Yes | src/pages/complaints/escalations/EscalationRulesAdmin.tsx | 67 |
| pages/complaints/escalations/RuleCard | Test rule | — | Yes | src/pages/complaints/escalations/RuleCard.tsx | 121 |
| pages/complaints/IntakeQueue | Open | — | Yes | src/pages/complaints/IntakeQueue.tsx | 257 |
| pages/complaints/IntakeQueue | Previous | — | Yes | src/pages/complaints/IntakeQueue.tsx | 270 |
| pages/complaints/IntakeQueue | Next | — | Yes | src/pages/complaints/IntakeQueue.tsx | 272 |
| pages/complaints/NewInternalComplaint | Cancel | — | Yes | src/pages/complaints/NewInternalComplaint.tsx | 286 |
| pages/complaints/rfi-approvals/RfiApprovalQueue | Review | complaint_management.configure | No | src/pages/complaints/rfi-approvals/RfiApprovalQueue.tsx | 116 |
| pages/compliance/ComplianceReturns | Submit | returns_management.edit | Yes | src/pages/compliance/ComplianceReturns.tsx | 287 |
| pages/compliance/ComplianceReturns | New Submission | returns_management.create | Yes | src/pages/compliance/ComplianceReturns.tsx | 331 |
| pages/compliance/ComplianceReturns | Clear filter | — | Yes | src/pages/compliance/ComplianceReturns.tsx | 509 |
| pages/compliance/ComplianceReturns | Configure Penalties | compliance_management.edit | Yes | src/pages/compliance/ComplianceReturns.tsx | 566 |
| pages/compliance/ReturnSubmission | Back to Returns | — | Yes | src/pages/compliance/ReturnSubmission.tsx | 687 |
| pages/compliance/ReturnSubmission | Back | — | Yes | src/pages/compliance/ReturnSubmission.tsx | 701 |
| pages/compliance/ReturnSubmission | Cancel | returns_management.create | Yes | src/pages/compliance/ReturnSubmission.tsx | 815 |
| pages/compliance/ReturnSubmission | Create | returns_management.create | Yes | src/pages/compliance/ReturnSubmission.tsx | 823 |
| pages/compliance/ReturnSubmission | Back | — | Yes | src/pages/compliance/ReturnSubmission.tsx | 846 |
| pages/compliance/ReturnSubmission | Section / | returns_management.edit | Yes | src/pages/compliance/ReturnSubmission.tsx | 995 |
| pages/compliance/ReturnSubmission | Previous | — | Yes | src/pages/compliance/ReturnSubmission.tsx | 1057 |
| pages/compliance/ReturnSubmission | Next | — | Yes | src/pages/compliance/ReturnSubmission.tsx | 1061 |
| pages/conduct/Conduct360 | Back to entities | — | Yes | src/pages/conduct/Conduct360.tsx | 171 |
| pages/conduct/ConductActions | Issue requirement | conduct_management.create | Yes | src/pages/conduct/ConductActions.tsx | 64 |
| pages/conduct/ConductActions | Overdue only | — | No | src/pages/conduct/ConductActions.tsx | 107 |
| pages/conduct/ConductAlerts | Acknowledge | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 182 |
| pages/conduct/ConductAlerts | Promote | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 195 |
| pages/conduct/ConductAlerts | Dispose | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 205 |
| pages/conduct/ConductAlerts | Cancel | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 305 |
| pages/conduct/ConductAlerts | Record disposition | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 306 |
| pages/conduct/ConductAlerts | Cancel | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 360 |
| pages/conduct/ConductAlerts | Open investigation | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 361 |
| pages/conduct/ConductEntitiesList | Conduct 360 | — | No | src/pages/conduct/ConductEntitiesList.tsx | 100 |
| pages/conduct/ConductPatternDetail | Try again | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 99 |
| pages/conduct/ConductPatternDetail | Record review decision | — | No | src/pages/conduct/ConductPatternDetail.tsx | 129 |
| pages/conduct/ConductPatternDetail | Attach evidence | — | No | src/pages/conduct/ConductPatternDetail.tsx | 132 |
| pages/conduct/ConductPatternDetail | Signal raised | — | No | src/pages/conduct/ConductPatternDetail.tsx | 136 |
| pages/conduct/ConductPatternDetail | Raise conduct signal | — | No | src/pages/conduct/ConductPatternDetail.tsx | 142 |
| pages/conduct/ConductPatternDetail | Alert already raised | — | No | src/pages/conduct/ConductPatternDetail.tsx | 145 |
| pages/conduct/ConductPatternDetail | Raise conduct alert | — | No | src/pages/conduct/ConductPatternDetail.tsx | 149 |
| pages/conduct/ConductPatternDetail | Open | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 360 |
| pages/conduct/ConductPatternDetail | Attach evidence | — | No | src/pages/conduct/ConductPatternDetail.tsx | 396 |
| pages/conduct/ConductPatternDetail | Cancel | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 593 |
| pages/conduct/ConductPatternDetail | Record decision | — | No | src/pages/conduct/ConductPatternDetail.tsx | 594 |
| pages/conduct/ConductPatternDetail | Cancel | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 640 |
| pages/conduct/ConductPatternDetail | Attach evidence | — | No | src/pages/conduct/ConductPatternDetail.tsx | 641 |
| pages/conduct/ConductPatternDetail | Cancel | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 674 |
| pages/conduct/ConductPatternDetail | Raise signal | — | No | src/pages/conduct/ConductPatternDetail.tsx | 675 |
| pages/conduct/ConductPatternDetail | Cancel | — | Yes | src/pages/conduct/ConductPatternDetail.tsx | 708 |
| pages/conduct/ConductPatternDetail | Raise alert | — | No | src/pages/conduct/ConductPatternDetail.tsx | 709 |
| pages/conduct/ConductPatterns | Refresh | — | Yes | src/pages/conduct/ConductPatterns.tsx | 181 |
| pages/conduct/ConductPatterns | Clear filters | — | Yes | src/pages/conduct/ConductPatterns.tsx | 182 |
| pages/conduct/ConductPatterns | Try again | — | Yes | src/pages/conduct/ConductPatterns.tsx | 202 |
| pages/conduct/ConductPatterns | Previous | — | Yes | src/pages/conduct/ConductPatterns.tsx | 289 |
| pages/conduct/ConductPatterns | Next | — | Yes | src/pages/conduct/ConductPatterns.tsx | 293 |
| pages/conduct/ConductPrioritisation | Intervention register | — | No | src/pages/conduct/ConductPrioritisation.tsx | 117 |
| pages/conduct/ConductPrioritisation | Compute prioritisation | — | No | src/pages/conduct/ConductPrioritisation.tsx | 145 |
| pages/conduct/ConductPrioritisation | Propose intervention | — | No | src/pages/conduct/ConductPrioritisation.tsx | 222 |
| pages/conduct/ConductPrioritisation | Cancel | — | Yes | src/pages/conduct/ConductPrioritisation.tsx | 287 |
| pages/conduct/ConductPrioritisation | Propose for decision | — | No | src/pages/conduct/ConductPrioritisation.tsx | 288 |
| pages/conduct/ConductSignalDetail | Try again | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 82 |
| pages/conduct/ConductSignalDetail | Back to signals | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 83 |
| pages/conduct/ConductSignalDetail | Assign owner | — | No | src/pages/conduct/ConductSignalDetail.tsx | 108 |
| pages/conduct/ConductSignalDetail | Validate | — | No | src/pages/conduct/ConductSignalDetail.tsx | 110 |
| pages/conduct/ConductSignalDetail | Dismiss | — | No | src/pages/conduct/ConductSignalDetail.tsx | 112 |
| pages/conduct/ConductSignalDetail | Escalate to alert | — | No | src/pages/conduct/ConductSignalDetail.tsx | 114 |
| pages/conduct/ConductSignalDetail | Link existing alert | — | No | src/pages/conduct/ConductSignalDetail.tsx | 116 |
| pages/conduct/ConductSignalDetail | Reopen | — | No | src/pages/conduct/ConductSignalDetail.tsx | 120 |
| pages/conduct/ConductSignalDetail | Attach evidence | — | No | src/pages/conduct/ConductSignalDetail.tsx | 373 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 478 |
| pages/conduct/ConductSignalDetail | Assign | — | No | src/pages/conduct/ConductSignalDetail.tsx | 479 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 528 |
| pages/conduct/ConductSignalDetail | Validate | — | No | src/pages/conduct/ConductSignalDetail.tsx | 529 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 594 |
| pages/conduct/ConductSignalDetail | Escalate | — | No | src/pages/conduct/ConductSignalDetail.tsx | 595 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 644 |
| pages/conduct/ConductSignalDetail | Link alert | — | No | src/pages/conduct/ConductSignalDetail.tsx | 645 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 686 |
| pages/conduct/ConductSignalDetail | Attach | — | No | src/pages/conduct/ConductSignalDetail.tsx | 687 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 711 |
| pages/conduct/ConductSignals | Raise signal | — | No | src/pages/conduct/ConductSignals.tsx | 93 |
| pages/conduct/ConductSignals | Try again | — | Yes | src/pages/conduct/ConductSignals.tsx | 166 |
| pages/conduct/ConductSignals | Previous | — | Yes | src/pages/conduct/ConductSignals.tsx | 207 |
| pages/conduct/ConductSignals | Next | — | Yes | src/pages/conduct/ConductSignals.tsx | 209 |
| pages/conduct/ConductSignals | Cancel | — | Yes | src/pages/conduct/ConductSignals.tsx | 319 |
| pages/conduct/ConductSignals | Raise signal | — | No | src/pages/conduct/ConductSignals.tsx | 320 |
| pages/conduct/ConductWorkQueue | Sort by priority | — | No | src/pages/conduct/ConductWorkQueue.tsx | 145 |
| pages/conduct/ConductWorkQueue | Include closed | — | No | src/pages/conduct/ConductWorkQueue.tsx | 148 |
| pages/conduct/ConductWorkQueue | Clear filters | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 152 |
| pages/conduct/ConductWorkQueue | Open | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 233 |
| pages/conduct/ConductWorkQueue | Previous | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 249 |
| pages/conduct/ConductWorkQueue | Next | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 250 |
| pages/conduct/EmergingRiskDetail | Back to the register | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 193 |
| pages/conduct/EmergingRiskDetail | Back to the register | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 215 |
| pages/conduct/EmergingRiskDetail | Record an assessment | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 246 |
| pages/conduct/EmergingRiskDetail | Link a record | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 249 |
| pages/conduct/EmergingRiskDetail | Record supervisory follow-up | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 252 |
| pages/conduct/EmergingRiskDetail | Change status | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 256 |
| pages/conduct/EmergingRiskDetail | Cancel | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 503 |
| pages/conduct/EmergingRiskDetail | Record change | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 504 |
| pages/conduct/EmergingRiskDetail | Cancel | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 572 |
| pages/conduct/EmergingRiskDetail | Record assessment | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 573 |
| pages/conduct/EmergingRiskDetail | Cancel | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 615 |
| pages/conduct/EmergingRiskDetail | Link record | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 616 |
| pages/conduct/EmergingRiskDetail | Cancel | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 655 |
| pages/conduct/EmergingRiskDetail | Record follow-up | — | No | src/pages/conduct/EmergingRiskDetail.tsx | 656 |
| pages/conduct/EmergingRisksRegister | Go to Supervisory Intelligence | — | Yes | src/pages/conduct/EmergingRisksRegister.tsx | 84 |
| pages/conduct/InterventionDetail | Back to the register | — | Yes | src/pages/conduct/InterventionDetail.tsx | 154 |
| pages/conduct/InterventionDetail | Back to the register | — | Yes | src/pages/conduct/InterventionDetail.tsx | 174 |
| pages/conduct/InterventionDetail | Record an endorsement decision | — | No | src/pages/conduct/InterventionDetail.tsx | 216 |
| pages/conduct/InterventionDetail | Change status | — | No | src/pages/conduct/InterventionDetail.tsx | 221 |
| pages/conduct/InterventionDetail | Record the outcome | — | No | src/pages/conduct/InterventionDetail.tsx | 229 |
| pages/conduct/InterventionDetail | Record follow-up | — | No | src/pages/conduct/InterventionDetail.tsx | 232 |
| pages/conduct/InterventionDetail | Link the record | — | No | src/pages/conduct/InterventionDetail.tsx | 237 |
| pages/conduct/InterventionDetail | Reassess the concern | — | No | src/pages/conduct/InterventionDetail.tsx | 242 |
| pages/conduct/InterventionDetail | Open the record | — | Yes | src/pages/conduct/InterventionDetail.tsx | 339 |
| pages/conduct/InterventionDetail | Open the risk | — | Yes | src/pages/conduct/InterventionDetail.tsx | 422 |
| pages/conduct/InterventionDetail | Open the attention item | — | Yes | src/pages/conduct/InterventionDetail.tsx | 443 |
| pages/conduct/InterventionDetail | Open the plan | — | Yes | src/pages/conduct/InterventionDetail.tsx | 462 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 590 |
| pages/conduct/InterventionDetail | Record the decision | — | No | src/pages/conduct/InterventionDetail.tsx | 591 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 635 |
| pages/conduct/InterventionDetail | Record the change | — | No | src/pages/conduct/InterventionDetail.tsx | 636 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 709 |
| pages/conduct/InterventionDetail | Record the outcome | — | No | src/pages/conduct/InterventionDetail.tsx | 710 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 768 |
| pages/conduct/InterventionDetail | Record the follow-up | — | No | src/pages/conduct/InterventionDetail.tsx | 769 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 813 |
| pages/conduct/InterventionDetail | Link the record | — | No | src/pages/conduct/InterventionDetail.tsx | 814 |
| pages/conduct/InterventionDetail | Cancel | — | Yes | src/pages/conduct/InterventionDetail.tsx | 881 |
| pages/conduct/InterventionDetail | Record the reassessment | — | No | src/pages/conduct/InterventionDetail.tsx | 882 |
| pages/conduct/InterventionsRegister | Prioritisation | — | No | src/pages/conduct/InterventionsRegister.tsx | 64 |
| pages/conduct/InvestigationClosureQueue | Review | — | No | src/pages/conduct/InvestigationClosureQueue.tsx | 73 |
| pages/conduct/InvestigationDetail | Work queue | — | No | src/pages/conduct/InvestigationDetail.tsx | 61 |
| pages/conduct/Investigations | Conduct work queue | — | No | src/pages/conduct/Investigations.tsx | 62 |
| pages/conduct/Investigations | Open investigation | — | Yes | src/pages/conduct/Investigations.tsx | 63 |
| pages/conduct/ManagementReporting | Show records | — | No | src/pages/conduct/ManagementReporting.tsx | 348 |
| pages/conduct/ManagementReporting | Open | — | Yes | src/pages/conduct/ManagementReporting.tsx | 578 |
| pages/conduct/ManagementReporting | Export and record | — | No | src/pages/conduct/ManagementReporting.tsx | 604 |
| pages/conduct/SupervisionLoop | Export Full Conduct Report | — | No | src/pages/conduct/SupervisionLoop.tsx | 98 |
| pages/conduct/SupervisionLoop | Reset | — | Yes | src/pages/conduct/SupervisionLoop.tsx | 136 |
| pages/conduct/SupervisoryAttentionDetail | Calculate priority | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 248 |
| pages/conduct/SupervisoryAttentionDetail | Confirm priority | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 256 |
| pages/conduct/SupervisoryAttentionDetail | Change status | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 261 |
| pages/conduct/SupervisoryAttentionDetail | Save | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 381 |
| pages/conduct/SupervisoryAttentionDetail | Create plan | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 409 |
| pages/conduct/SupervisoryAttentionDetail | Initiate intervention | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 455 |
| pages/conduct/SupervisoryAttentionDetail | Record reassessment | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 515 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 628 |
| pages/conduct/SupervisoryAttentionDetail | Confirm priority | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 629 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 673 |
| pages/conduct/SupervisoryAttentionDetail | Record change | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 674 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 732 |
| pages/conduct/SupervisoryAttentionDetail | Create draft plan | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 733 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 809 |
| pages/conduct/SupervisoryAttentionDetail | Initiate | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 810 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 866 |
| pages/conduct/SupervisoryAttentionDetail | Record reassessment | — | No | src/pages/conduct/SupervisoryAttentionDetail.tsx | 867 |
| pages/conduct/SupervisoryAttentionRegister | Open | — | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 77 |
| pages/conduct/SupervisoryAttentionRegister | Raise attention item | — | No | src/pages/conduct/SupervisoryAttentionRegister.tsx | 155 |
| pages/conduct/SupervisoryAttentionRegister | Cancel | — | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 538 |
| pages/conduct/SupervisoryAttentionRegister | Record attention item | — | No | src/pages/conduct/SupervisoryAttentionRegister.tsx | 539 |
| pages/conduct/SupervisoryIntelligence | Emerging risk register | — | No | src/pages/conduct/SupervisoryIntelligence.tsx | 220 |
| pages/conduct/SupervisoryIntelligence | Raise an emerging risk from this position | — | No | src/pages/conduct/SupervisoryIntelligence.tsx | 355 |
| pages/conduct/SupervisoryIntelligence | Cancel | — | Yes | src/pages/conduct/SupervisoryIntelligence.tsx | 489 |
| pages/conduct/SupervisoryIntelligence | Record risk | — | No | src/pages/conduct/SupervisoryIntelligence.tsx | 490 |
| pages/conduct/SupervisoryPlanDetail | Back to supervisory attention | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 129 |
| pages/conduct/SupervisoryPlanDetail | Back to supervisory attention | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 149 |
| pages/conduct/SupervisoryPlanDetail | Change status | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 192 |
| pages/conduct/SupervisoryPlanDetail | Add a milestone | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 196 |
| pages/conduct/SupervisoryPlanDetail | Raise an intervention under this plan | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 203 |
| pages/conduct/SupervisoryPlanDetail | Open the attention item | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 312 |
| pages/conduct/SupervisoryPlanDetail | Edit | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 375 |
| pages/conduct/SupervisoryPlanDetail | Mark completed | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 386 |
| pages/conduct/SupervisoryPlanDetail | Open | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 452 |
| pages/conduct/SupervisoryPlanDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 555 |
| pages/conduct/SupervisoryPlanDetail | Record the change | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 556 |
| pages/conduct/SupervisoryPlanDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 597 |
| pages/conduct/SupervisoryPlanDetail | Save the milestone | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 598 |
| pages/conduct/SupervisoryPlanDetail | Cancel | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 679 |
| pages/conduct/SupervisoryPlanDetail | Raise the intervention | — | No | src/pages/conduct/SupervisoryPlanDetail.tsx | 680 |
| pages/conduct/SurveillanceWorkspace | Review | — | No | src/pages/conduct/SurveillanceWorkspace.tsx | 138 |
| pages/coordination/CoordinationDetail | Close Case | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 296 |
| pages/coordination/CoordinationDetail | Cancel | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 326 |
| pages/coordination/CoordinationDetail | Close Case | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 327 |
| pages/coordination/CoordinationDetail | Open | — | Yes | src/pages/coordination/CoordinationDetail.tsx | 349 |
| pages/coordination/CoordinationDetail | Post | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 395 |
| pages/coordination/CoordinationDetail | Invite | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 485 |
| pages/coordination/CoordinationDetail | Cancel | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 515 |
| pages/coordination/CoordinationDetail | Invite | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 516 |
| pages/coordination/CoordinationDetail | Clear | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 548 |
| pages/coordination/CoordinationDetail | Block | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 551 |
| pages/coordination/CoordinationDetail | Raise Flag | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 628 |
| pages/coordination/CoordinationDetail | Cancel | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 665 |
| pages/coordination/CoordinationDetail | Raise | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 666 |
| pages/coordination/CoordinationDetail | Resolve | coordination.edit | Yes | src/pages/coordination/CoordinationDetail.tsx | 693 |
| pages/coordination/CoordinationList | New Case | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 117 |
| pages/coordination/CoordinationList | Cancel | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 161 |
| pages/coordination/CoordinationList | Create | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 162 |
| pages/coordination/CoordinationList | Open | — | Yes | src/pages/coordination/CoordinationList.tsx | 206 |
| pages/correspondence/CorrespondenceDashboard | Open inbox | — | Yes | src/pages/correspondence/CorrespondenceDashboard.tsx | 69 |
| pages/correspondence/CorrespondenceRecords | Export index | correspondence_management.export | Yes | src/pages/correspondence/CorrespondenceRecords.tsx | 28 |
| pages/correspondence/RoutingRulesAdmin | New rule | settings.create | Yes | src/pages/correspondence/RoutingRulesAdmin.tsx | 61 |
| pages/correspondence/RoutingRulesAdmin | Cancel | — | Yes | src/pages/correspondence/RoutingRulesAdmin.tsx | 128 |
| pages/correspondence/RoutingRulesAdmin | Save rule | — | No | src/pages/correspondence/RoutingRulesAdmin.tsx | 129 |
| pages/correspondence/ThreadWorkspace | Back to work queue | — | Yes | src/pages/correspondence/ThreadWorkspace.tsx | 46 |
| pages/correspondence/ThreadWorkspace | Work queue | — | No | src/pages/correspondence/ThreadWorkspace.tsx | 71 |
| pages/delegation/DelegationRules | New Role Transfer | delegation.create | Yes | src/pages/delegation/DelegationRules.tsx | 332 |
| pages/enforcement/EnforcementWorkQueue | Include closed | — | No | src/pages/enforcement/EnforcementWorkQueue.tsx | 175 |
| pages/enforcement/EnforcementWorkQueue | Clear filters | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 179 |
| pages/enforcement/EnforcementWorkQueue | Previous | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 280 |
| pages/enforcement/EnforcementWorkQueue | Next | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 281 |
| pages/enforcement/EnforcementWorkspace | Back to the enforcement queue | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 213 |
| pages/enforcement/EnforcementWorkspace | Enforcement queue | — | No | src/pages/enforcement/EnforcementWorkspace.tsx | 235 |
| pages/enforcement/EnforcementWorkspace | Cancel | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 731 |
| pages/enforcement/EnforcementWorkspace | Confirm | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 732 |
| pages/entities/Entity360Detail | Return to current state | — | Yes | src/pages/entities/Entity360Detail.tsx | 161 |
| pages/entities/EntityDirectory | Search registry | — | No | src/pages/entities/EntityDirectory.tsx | 237 |
| pages/entities/EntityDirectory | Clear | — | Yes | src/pages/entities/EntityDirectory.tsx | 241 |
| pages/entities/EntityStructureHub | Entity 360 | — | No | src/pages/entities/EntityStructureHub.tsx | 118 |
| pages/entities/EntityStructureHub | Start request | — | No | src/pages/entities/EntityStructureHub.tsx | 332 |
| pages/entities/EntityStructureHub | Approve | — | No | src/pages/entities/EntityStructureHub.tsx | 407 |
| pages/entities/EntityStructureHub | Reject | — | No | src/pages/entities/EntityStructureHub.tsx | 413 |
| pages/entities/EntityStructureHub | Apply | — | Yes | src/pages/entities/EntityStructureHub.tsx | 422 |
| pages/entity/complaint-rfis/MyComplaintRfis | Submit for review | — | No | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 160 |
| pages/entity/complaint-rfis/MyComplaintRfis | Attach document | — | No | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 288 |
| pages/entity/complaint-rfis/MyComplaintRfis | Attach document (optional) | — | No | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 310 |
| pages/entity/complaint-rfis/MyComplaintRfis | Save draft | — | No | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 316 |
| pages/entity/correspondence/MyCorrespondence | Open | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 89 |
| pages/entity/correspondence/MyCorrespondence | Previous | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 103 |
| pages/entity/correspondence/MyCorrespondence | Next | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 105 |
| pages/entity/correspondence/MyCorrespondenceDetail | Back | — | Yes | src/pages/entity/correspondence/MyCorrespondenceDetail.tsx | 53 |
| pages/entity/correspondence/MyCorrespondenceDetail | Back to my correspondence | — | Yes | src/pages/entity/correspondence/MyCorrespondenceDetail.tsx | 63 |
| pages/entity/MySupervisoryActions | Submit response | — | No | src/pages/entity/MySupervisoryActions.tsx | 65 |
| pages/entity/MySupervisoryActions | Cancel | — | Yes | src/pages/entity/MySupervisoryActions.tsx | 78 |
| pages/entity/MySupervisoryActions | Respond | — | No | src/pages/entity/MySupervisoryActions.tsx | 82 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Validate | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 145 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Review &amp; submit | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 149 |
| pages/entity/returns/canonical/EntityFilingWorkspace | . {status === 'issue' && ( )} | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 230 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Review &amp; submit | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 252 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Previous form | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 293 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Open form | — | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 347 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Validate return | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 428 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Submit return | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 432 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Submit response | — | No | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 538 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | New Return | — | No | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 128 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | New Return | — | No | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 177 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | Open | — | Yes | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 280 |
| pages/entity/returns/CreateReturnPage | Next | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 329 |
| pages/entity/returns/CreateReturnPage | Back | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 363 |
| pages/entity/returns/CreateReturnPage | Next | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 364 |
| pages/entity/returns/CreateReturnPage | Back | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 382 |
| pages/entity/returns/EntityReturnsDashboard | Go to Returns workspace | — | Yes | src/pages/entity/returns/EntityReturnsDashboard.tsx | 66 |
| pages/entity/returns/EntityReturnsDashboard | New Return | — | No | src/pages/entity/returns/EntityReturnsDashboard.tsx | 69 |
| pages/entity/returns/FillReturnPage | Previous | returns_management.edit | Yes | src/pages/entity/returns/FillReturnPage.tsx | 903 |
| pages/entity/returns/FillReturnPage | Next | returns_management.edit | Yes | src/pages/entity/returns/FillReturnPage.tsx | 908 |
| pages/entity/returns/FillReturnPage | Review &amp; Submit | returns_management.edit | Yes | src/pages/entity/returns/FillReturnPage.tsx | 913 |
| pages/entity/returns/MyReturnsPage | Create New Return | returns_management.create | Yes | src/pages/entity/returns/MyReturnsPage.tsx | 45 |
| pages/entity/returns/ViewReturnPage | Edit & Resubmit | returns_management.edit | Yes | src/pages/entity/returns/ViewReturnPage.tsx | 279 |
| pages/entity/returns/ViewReturnPage | Request Edit | returns_management.edit | Yes | src/pages/entity/returns/ViewReturnPage.tsx | 282 |
| pages/entity/returns/ViewReturnPage | Cancel | returns_management.edit | Yes | src/pages/entity/returns/ViewReturnPage.tsx | 366 |
| pages/entity/returns/ViewReturnPage | Submit Request | returns_management.edit | Yes | src/pages/entity/returns/ViewReturnPage.tsx | 367 |
| pages/ForgotPassword | Back to Sign In | — | Yes | src/pages/ForgotPassword.tsx | 89 |
| pages/ForgotPassword | Back to Sign In | — | Yes | src/pages/ForgotPassword.tsx | 113 |
| pages/fpa/FpaAiAnalysis | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaAiAnalysis.tsx | 474 |
| pages/fpa/FpaAiAnalysis | Apply Override | fit_and_proper.edit | Yes | src/pages/fpa/FpaAiAnalysis.tsx | 477 |
| pages/fpa/FpaAiAnalysis | Individual | fit_and_proper.view | Yes | src/pages/fpa/FpaAiAnalysis.tsx | 555 |
| pages/fpa/FpaAiAnalysis | Override | fit_and_proper.edit | Yes | src/pages/fpa/FpaAiAnalysis.tsx | 661 |
| pages/fpa/FpaAiAnalysis | View Individual | — | Yes | src/pages/fpa/FpaAiAnalysis.tsx | 892 |
| pages/fpa/FpaAppeals | File Appeal | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 562 |
| pages/fpa/FpaAppeals | Start Review | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 738 |
| pages/fpa/FpaAppeals | Record Decision | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 752 |
| pages/fpa/FpaAppeals | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 961 |
| pages/fpa/FpaAppeals | File Appeal | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 967 |
| pages/fpa/FpaAppeals | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 1057 |
| pages/fpa/FpaAppeals | Confirm Decision | fit_and_proper.edit | Yes | src/pages/fpa/FpaAppeals.tsx | 1067 |
| pages/fpa/FpaAssessmentWorkspace | Back to F&P processes | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 195 |
| pages/fpa/FpaAssessmentWorkspace | F&P processes | — | No | src/pages/fpa/FpaAssessmentWorkspace.tsx | 214 |
| pages/fpa/FpaAssessmentWorkspace | Return to current step | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 254 |
| pages/fpa/FpaAssessmentWorkspace | {a.requires_reason && pendingAction?.code !== a.code ? a.label : `Confirm: $ `} | — | No | src/pages/fpa/FpaAssessmentWorkspace.tsx | 329 |
| pages/fpa/FpaAssessmentWorkspace | Request declaration | — | No | src/pages/fpa/FpaAssessmentWorkspace.tsx | 388 |
| pages/fpa/FpaAssessmentWorkspace | Open | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 472 |
| pages/fpa/FpaAssessmentWorkspace | Assign | — | No | src/pages/fpa/FpaAssessmentWorkspace.tsx | 515 |
| pages/fpa/FpaAssessmentWorkspace | Open case | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 741 |
| pages/fpa/FpaCommittee | New Committee | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 686 |
| pages/fpa/FpaCommittee | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 746 |
| pages/fpa/FpaCommittee | Create Committee | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 749 |
| pages/fpa/FpaCommittee | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaCommittee.tsx | 825 |
| pages/fpa/FpaCommittee | Save Changes | fit_and_proper.edit | Yes | src/pages/fpa/FpaCommittee.tsx | 828 |
| pages/fpa/FpaCommittee | Add Member | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 946 |
| pages/fpa/FpaCommittee | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 1014 |
| pages/fpa/FpaCommittee | Add Member | fit_and_proper.create | Yes | src/pages/fpa/FpaCommittee.tsx | 1017 |
| pages/fpa/FpaCommittee | Record final decision | fit_and_proper.approve | Yes | src/pages/fpa/FpaCommittee.tsx | 1303 |
| pages/fpa/FpaCommittee | Record Vote | fit_and_proper.edit | Yes | src/pages/fpa/FpaCommittee.tsx | 1535 |
| pages/fpa/FpaConditions | Run Sweep Now | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 508 |
| pages/fpa/FpaConditions | Add Condition | fit_and_proper.create | Yes | src/pages/fpa/FpaConditions.tsx | 520 |
| pages/fpa/FpaConditions | Clear filters | — | Yes | src/pages/fpa/FpaConditions.tsx | 653 |
| pages/fpa/FpaConditions | Mark Satisfied | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 790 |
| pages/fpa/FpaConditions | Waive | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 802 |
| pages/fpa/FpaConditions | Remind | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 813 |
| pages/fpa/FpaConditions | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 894 |
| pages/fpa/FpaConditions | Confirm Satisfied | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 900 |
| pages/fpa/FpaConditions | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 958 |
| pages/fpa/FpaConditions | Confirm Waiver | fit_and_proper.edit | Yes | src/pages/fpa/FpaConditions.tsx | 964 |
| pages/fpa/FpaConditions | Close | — | Yes | src/pages/fpa/FpaConditions.tsx | 1033 |
| pages/fpa/FpaConditions | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaConditions.tsx | 1197 |
| pages/fpa/FpaConditions | Add Condition | fit_and_proper.create | Yes | src/pages/fpa/FpaConditions.tsx | 1203 |
| pages/fpa/FpaDashboard | View | — | Yes | src/pages/fpa/FpaDashboard.tsx | 99 |
| pages/fpa/FpaDashboard | View | — | Yes | src/pages/fpa/FpaDashboard.tsx | 109 |
| pages/fpa/FpaDeclarations | View | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 80 |
| pages/fpa/FpaDeclarations | Close | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 144 |
| pages/fpa/FpaDeclarations | Request Declaration | fit_and_proper.create | Yes | src/pages/fpa/FpaDeclarations.tsx | 608 |
| pages/fpa/FpaDeclarations | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaDeclarations.tsx | 797 |
| pages/fpa/FpaDeclarations | Send Request | fit_and_proper.create | Yes | src/pages/fpa/FpaDeclarations.tsx | 800 |
| pages/fpa/FpaDeclarations | Close | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 810 |
| pages/fpa/FpaDeclarations | Retry | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 826 |
| pages/fpa/FpaDeclarations | Retry | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 895 |
| pages/fpa/FpaDeclarations | Remind | fit_and_proper.edit | Yes | src/pages/fpa/FpaDeclarations.tsx | 979 |
| pages/fpa/FpaDeclarations | Retry | — | Yes | src/pages/fpa/FpaDeclarations.tsx | 1034 |
| pages/fpa/FpaDeterminations | Add Condition | fit_and_proper.create | Yes | src/pages/fpa/FpaDeterminations.tsx | 340 |
| pages/fpa/FpaDeterminations | New Determination | fit_and_proper.create | Yes | src/pages/fpa/FpaDeterminations.tsx | 846 |
| pages/fpa/FpaDeterminations | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaDeterminations.tsx | 1088 |
| pages/fpa/FpaDeterminations | List View | — | Yes | src/pages/fpa/FpaDeterminations.tsx | 1178 |
| pages/fpa/FpaDeterminations | Comparison View | — | Yes | src/pages/fpa/FpaDeterminations.tsx | 1187 |
| pages/fpa/FpaDeterminations | View | — | Yes | src/pages/fpa/FpaDeterminations.tsx | 1322 |
| pages/fpa/FpaDeterminations | Not now | fit_and_proper.create | Yes | src/pages/fpa/FpaDeterminations.tsx | 1400 |
| pages/fpa/FpaDeterminations | Add Condition | fit_and_proper.create | Yes | src/pages/fpa/FpaDeterminations.tsx | 1403 |
| pages/fpa/FpaFindingDetail | Back to Findings | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindingDetail.tsx | 172 |
| pages/fpa/FpaFindingDetail | Back to Findings Console | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindingDetail.tsx | 198 |
| pages/fpa/FpaFindingDetail | Manage in Review Queue | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindingDetail.tsx | 202 |
| pages/fpa/FpaFindings | Clear filters | — | Yes | src/pages/fpa/FpaFindings.tsx | 577 |
| pages/fpa/FpaFindings | Review | fit_and_proper.view | Yes | src/pages/fpa/FpaFindings.tsx | 749 |
| pages/fpa/FpaFindings | Manage | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindings.tsx | 758 |
| pages/fpa/FpaFindings | Escalate | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindings.tsx | 768 |
| pages/fpa/FpaFindings | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindings.tsx | 852 |
| pages/fpa/FpaFindings | Escalate Finding | fit_and_proper.edit | Yes | src/pages/fpa/FpaFindings.tsx | 861 |
| pages/fpa/FpaIndividualProfile | Edit | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 214 |
| pages/fpa/FpaIndividualProfile | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 320 |
| pages/fpa/FpaIndividualProfile | Save changes | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 323 |
| pages/fpa/FpaIndividualProfile | Reassessment scheduler | fit_and_proper.create | No | src/pages/fpa/FpaIndividualProfile.tsx | 499 |
| pages/fpa/FpaIndividualProfile | Add Role | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 507 |
| pages/fpa/FpaIndividualProfile | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 575 |
| pages/fpa/FpaIndividualProfile | Add Role | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 578 |
| pages/fpa/FpaIndividualProfile | Cease | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 659 |
| pages/fpa/FpaIndividualProfile | Request Declaration | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 773 |
| pages/fpa/FpaIndividualProfile | Close | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 796 |
| pages/fpa/FpaIndividualProfile | Start New Assessment | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 864 |
| pages/fpa/FpaIndividualProfile | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 891 |
| pages/fpa/FpaIndividualProfile | Create Assessment | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 894 |
| pages/fpa/FpaIndividualProfile | Open case | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 947 |
| pages/fpa/FpaIndividualProfile | Log Access Denial | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1036 |
| pages/fpa/FpaIndividualProfile | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1061 |
| pages/fpa/FpaIndividualProfile | Submit Denial Log | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1064 |
| pages/fpa/FpaIndividualProfile | Retry | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1206 |
| pages/fpa/FpaIndividualProfile | Back to Individuals | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1209 |
| pages/fpa/FpaIndividualProfile | Back to Individuals | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1223 |
| pages/fpa/FpaIndividualProfile | View Findings | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1241 |
| pages/fpa/FpaIndividualProfile | Case Audit Trail | — | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 1247 |
| pages/fpa/FpaIndividuals | Add Individual | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividuals.tsx | 334 |
| pages/fpa/FpaIndividuals | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividuals.tsx | 476 |
| pages/fpa/FpaIndividuals | Register Individual | fit_and_proper.edit | Yes | src/pages/fpa/FpaIndividuals.tsx | 479 |
| pages/fpa/FpaIndividuals | Open | — | Yes | src/pages/fpa/FpaIndividuals.tsx | 607 |
| pages/fpa/FpaInitiation | Initiate | fit_and_proper.edit | Yes | src/pages/fpa/FpaInitiation.tsx | 431 |
| pages/fpa/FpaInitiation | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaInitiation.tsx | 600 |
| pages/fpa/FpaInitiation | Initiate Assessment | fit_and_proper.edit | Yes | src/pages/fpa/FpaInitiation.tsx | 603 |
| pages/fpa/FpaInitiation | View | — | Yes | src/pages/fpa/FpaInitiation.tsx | 698 |
| pages/fpa/FpaInitiation | Close | fit_and_proper.edit | Yes | src/pages/fpa/FpaInitiation.tsx | 767 |
| pages/fpa/FpaInitiation | Request Declaration | fit_and_proper.edit | Yes | src/pages/fpa/FpaInitiation.tsx | 771 |
| pages/fpa/FpaInitiationLog | Export CSV | fit_and_proper.export | Yes | src/pages/fpa/FpaInitiationLog.tsx | 191 |
| pages/fpa/FpaInitiationLog | Reset | — | Yes | src/pages/fpa/FpaInitiationLog.tsx | 272 |
| pages/fpa/FpaInvitationTracker | Send Invitation | fit_and_proper.create | Yes | src/pages/fpa/FpaInvitationTracker.tsx | 291 |
| pages/fpa/FpaInvitationTracker | Generate Invitation | fit_and_proper.create | Yes | src/pages/fpa/FpaInvitationTracker.tsx | 415 |
| pages/fpa/FpaInvitationTracker | Resend | fit_and_proper.create | Yes | src/pages/fpa/FpaInvitationTracker.tsx | 550 |
| pages/fpa/FpaManualTaskDetail | Save Notes | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 805 |
| pages/fpa/FpaManualTaskDetail | Mark CLEARED | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 828 |
| pages/fpa/FpaManualTaskDetail | Confirm ADVERSE | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 838 |
| pages/fpa/FpaManualTaskDetail | View Committee &amp; Voting | — | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 949 |
| pages/fpa/FpaManualTaskDetail | Back to Manual Tasks | — | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 1057 |
| pages/fpa/FpaManualTaskDetail | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 1097 |
| pages/fpa/FpaManualTaskDetail | Yes, Mark CLEARED | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 1100 |
| pages/fpa/FpaManualTaskDetail | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 1142 |
| pages/fpa/FpaManualTaskDetail | Confirm ADVERSE | fit_and_proper.edit | Yes | src/pages/fpa/FpaManualTaskDetail.tsx | 1151 |
| pages/fpa/FpaManualTasks | Open | — | Yes | src/pages/fpa/FpaManualTasks.tsx | 244 |
| pages/fpa/FpaManualTasks | Clear filters | — | Yes | src/pages/fpa/FpaManualTasks.tsx | 489 |
| pages/fpa/FpaMonitoring | Acknowledge | fit_and_proper.edit | Yes | src/pages/fpa/FpaMonitoring.tsx | 332 |
| pages/fpa/FpaMonitoring | Trigger Event | fit_and_proper.create | Yes | src/pages/fpa/FpaMonitoring.tsx | 552 |
| pages/fpa/FpaMonitoring | Clear filters | — | Yes | src/pages/fpa/FpaMonitoring.tsx | 668 |
| pages/fpa/FpaMonitoring | Retry | — | Yes | src/pages/fpa/FpaMonitoring.tsx | 712 |
| pages/fpa/FpaMonitoring | Export CSV | fit_and_proper.export | Yes | src/pages/fpa/FpaMonitoring.tsx | 759 |
| pages/fpa/FpaMonitoring | Retry | — | Yes | src/pages/fpa/FpaMonitoring.tsx | 787 |
| pages/fpa/FpaMonitoring | Cancel | fit_and_proper.create | Yes | src/pages/fpa/FpaMonitoring.tsx | 953 |
| pages/fpa/FpaMonitoring | Trigger Event | fit_and_proper.create | Yes | src/pages/fpa/FpaMonitoring.tsx | 956 |
| pages/fpa/FpaMonitoring | Cancel | fit_and_proper.edit | Yes | src/pages/fpa/FpaMonitoring.tsx | 1013 |
| pages/fpa/FpaMonitoring | Confirm Acknowledgement | fit_and_proper.edit | Yes | src/pages/fpa/FpaMonitoring.tsx | 1016 |
| pages/fpa/FpaProcessList | More filters | — | Yes | src/pages/fpa/FpaProcessList.tsx | 201 |
| pages/fpa/FpaProcessList | Clear these filters | fit_and_proper.view | Yes | src/pages/fpa/FpaProcessList.tsx | 229 |
| pages/fpa/FpaScheduler | Run Cycle Scheduler | fit_and_proper.execute | Yes | src/pages/fpa/FpaScheduler.tsx | 276 |
| pages/fpa/FpaScheduler | Export CSV | fit_and_proper.export | Yes | src/pages/fpa/FpaScheduler.tsx | 316 |
| pages/fpa/FpaScreening | Add Config | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 460 |
| pages/fpa/FpaScreening | Run Now | fit_and_proper_screening.edit | Yes | src/pages/fpa/FpaScreening.tsx | 495 |
| pages/fpa/FpaScreening | Cancel | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 773 |
| pages/fpa/FpaScreening | Add Configuration | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 776 |
| pages/fpa/FpaScreening | Cancel | — | Yes | src/pages/fpa/FpaScreening.tsx | 929 |
| pages/fpa/FpaScreening | Close | — | Yes | src/pages/fpa/FpaScreening.tsx | 1019 |
| pages/fpa/FpaSectorRules | Cancel | — | Yes | src/pages/fpa/FpaSectorRules.tsx | 439 |
| pages/fpa/FpaSectorRules | Add Rule | fit_and_proper.create | Yes | src/pages/fpa/FpaSectorRules.tsx | 615 |
| pages/fpa/FpaSectorRules | Clear filters | — | Yes | src/pages/fpa/FpaSectorRules.tsx | 653 |
| pages/fpa/FpaSectorRules | Edit | fit_and_proper.edit | Yes | src/pages/fpa/FpaSectorRules.tsx | 762 |
| pages/fpa/FpaTrends | Export MI Summary | fit_and_proper.export | Yes | src/pages/fpa/FpaTrends.tsx | 455 |
| pages/governance/ai/AiActivityDetail | Back to the activity register | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 65 |
| pages/governance/ai/AiActivityDetail | Activity register | — | No | src/pages/governance/ai/AiActivityDetail.tsx | 74 |
| pages/governance/ai/AiActivityDetail | Open Conduct 360 for this entity | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 96 |
| pages/governance/ai/AiActivityDetail | Start assurance review | — | No | src/pages/governance/ai/AiActivityDetail.tsx | 260 |
| pages/governance/ai/AiActivityDetail | Open review | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 277 |
| pages/governance/ai/AiActivityRegister | Open Conduct 360 | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 85 |
| pages/governance/ai/AiActivityRegister | Previous | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 178 |
| pages/governance/ai/AiActivityRegister | Next | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 179 |
| pages/governance/ai/AiAssurance | Open a review | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 72 |
| pages/governance/ai/AiAssurance | Open | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 161 |
| pages/governance/ai/AiAssurance | Cancel | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 211 |
| pages/governance/ai/AiAssurance | Open review | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 212 |
| pages/governance/ai/AiAssuranceDetail | Back to assurance | — | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 67 |
| pages/governance/ai/AiAssuranceDetail | All assurance reviews | — | No | src/pages/governance/ai/AiAssuranceDetail.tsx | 81 |
| pages/governance/ai/AiAssuranceDetail | Open the full AI activity record | — | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 155 |
| pages/governance/ai/AiAssuranceDetail | Record remediation | — | No | src/pages/governance/ai/AiAssuranceDetail.tsx | 254 |
| pages/governance/ai/AiAssuranceDetail | Conclude review | — | No | src/pages/governance/ai/AiAssuranceDetail.tsx | 313 |
| pages/governance/ai/AiExceptions | Open | — | Yes | src/pages/governance/ai/AiExceptions.tsx | 153 |
| pages/governance/ai/AiExceptions | Start assurance | — | No | src/pages/governance/ai/AiExceptions.tsx | 157 |
| pages/governance/ai/AiGovernanceOverview | AI activity register | — | No | src/pages/governance/ai/AiGovernanceOverview.tsx | 122 |
| pages/governance/ai/AiGovernanceOverview | Cancel | — | Yes | src/pages/governance/ai/AiGovernanceOverview.tsx | 273 |
| pages/governance/ai/AiInstructions | Register an instruction version | — | No | src/pages/governance/ai/AiInstructions.tsx | 84 |
| pages/governance/ai/AiInstructions | Full instruction as held on the server | — | No | src/pages/governance/ai/AiInstructions.tsx | 162 |
| pages/governance/ai/AiInstructions | Create new version | — | No | src/pages/governance/ai/AiInstructions.tsx | 188 |
| pages/governance/ai/AiInstructions | Edit draft | — | No | src/pages/governance/ai/AiInstructions.tsx | 191 |
| pages/governance/ai/AiInstructions | Cancel | — | Yes | src/pages/governance/ai/AiInstructions.tsx | 272 |
| pages/governance/ai/AiInstructions | Save as draft | — | No | src/pages/governance/ai/AiInstructions.tsx | 273 |
| pages/governance/ai/AiModels | Register a model version | — | No | src/pages/governance/ai/AiModels.tsx | 87 |
| pages/governance/ai/AiModels | Create new version | — | No | src/pages/governance/ai/AiModels.tsx | 168 |
| pages/governance/ai/AiModels | Edit draft | — | No | src/pages/governance/ai/AiModels.tsx | 171 |
| pages/governance/ai/AiModels | Cancel | — | Yes | src/pages/governance/ai/AiModels.tsx | 247 |
| pages/governance/ai/AiModels | Save as draft | — | No | src/pages/governance/ai/AiModels.tsx | 248 |
| pages/governance/ai/AiSurfaces | Reinstate | — | No | src/pages/governance/ai/AiSurfaces.tsx | 114 |
| pages/governance/ai/AiSurfaces | Suspend | — | No | src/pages/governance/ai/AiSurfaces.tsx | 119 |
| pages/governance/ai/AiSurfaces | Cancel | — | Yes | src/pages/governance/ai/AiSurfaces.tsx | 158 |
| pages/governance/ai/AiSurfaces | Record decision | — | No | src/pages/governance/ai/AiSurfaces.tsx | 159 |
| pages/governance/ai/AiUseCaseDetail | Back to capabilities | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 56 |
| pages/governance/ai/AiUseCaseDetail | All capabilities | — | No | src/pages/governance/ai/AiUseCaseDetail.tsx | 65 |
| pages/governance/ai/AiUseCaseDetail | Open model register | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 150 |
| pages/governance/ai/AiUseCaseDetail | Open instruction register | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 171 |
| pages/governance/ai/AiUseCaseDetail | Open | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 219 |
| pages/governance/ai/AiUseCases | Open | — | Yes | src/pages/governance/ai/AiUseCases.tsx | 105 |
| pages/inspections/InspectionDetail | ← Back to queue | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 205 |
| pages/inspections/InspectionDetail | ← Queue | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 214 |
| pages/inspections/InspectionDetail | Edit | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 221 |
| pages/inspections/InspectionDetail | Open licensee | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 244 |
| pages/inspections/InspectionDetail | Add finding | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 255 |
| pages/inspections/InspectionDetail | Escalate | inspection_management.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 301 |
| pages/inspections/InspectionDetail | Cancel | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 345 |
| pages/inspections/InspectionDetail | Save | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 346 |
| pages/inspections/InspectionDetail | Cancel | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 386 |
| pages/inspections/InspectionDetail | Save | market_conduct.edit | Yes | src/pages/inspections/InspectionDetail.tsx | 387 |
| pages/inspections/InspectionsCalendar | Today | — | Yes | src/pages/inspections/InspectionsCalendar.tsx | 81 |
| pages/inspections/InspectionsList | Calendar | — | Yes | src/pages/inspections/InspectionsList.tsx | 100 |
| pages/inspections/InspectionsList | Open | — | Yes | src/pages/inspections/InspectionsList.tsx | 156 |
| pages/licenses/LicenseDetail | Download Certificate | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 660 |
| pages/licenses/LicenseDetail | Renewal in progress | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 752 |
| pages/licenses/LicenseDetail | Continue Renewal | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 757 |
| pages/licenses/LicenseDetail | Renewal in progress | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 781 |
| pages/licenses/LicenseDetail | Continue Renewal | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 785 |
| pages/licenses/LicenseDetail | Renew License | license_management.edit | Yes | src/pages/licenses/LicenseDetail.tsx | 789 |
| pages/licenses/LicenseDetail | View submitted form | — | Yes | src/pages/licenses/LicenseDetail.tsx | 828 |
| pages/licenses/LicenseLifecycleQueue | Previous | — | Yes | src/pages/licenses/LicenseLifecycleQueue.tsx | 149 |
| pages/licenses/LicenseLifecycleQueue | Next | — | Yes | src/pages/licenses/LicenseLifecycleQueue.tsx | 152 |
| pages/licenses/LicensesList | Clear filter | — | Yes | src/pages/licenses/LicensesList.tsx | 249 |
| pages/licenses/LicensesList | Open | — | Yes | src/pages/licenses/LicensesList.tsx | 305 |
| pages/licenses/LicensesList | Previous | — | Yes | src/pages/licenses/LicensesList.tsx | 323 |
| pages/licenses/LicensesList | Next | — | Yes | src/pages/licenses/LicensesList.tsx | 324 |
| pages/licenses/LicensesList | View | license_management.view | Yes | src/pages/licenses/LicensesList.tsx | 372 |
| pages/licenses/LicensesList | Certificate | license_management.view | Yes | src/pages/licenses/LicensesList.tsx | 375 |
| pages/licensing/EntityResolutionDetail | Request more evidence | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 311 |
| pages/licensing/EntityResolutionDetail | Submit for supervisor review | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 320 |
| pages/licensing/EntityResolutionDetail | Approve recommendation | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 394 |
| pages/licensing/EntityResolutionDetail | Return for review | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 402 |
| pages/licensing/EntityResolutionDetail | Request more evidence | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 411 |
| pages/licensing/EntityResolutionDetail | Preview impact | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 518 |
| pages/licensing/EntityResolutionDetail | Execute merge | — | No | src/pages/licensing/EntityResolutionDetail.tsx | 536 |
| pages/licensing/EntityResolutionQueue | Review | — | No | src/pages/licensing/EntityResolutionQueue.tsx | 204 |
| pages/licensing/OnboardingWorkspace | Refresh | — | Yes | src/pages/licensing/OnboardingWorkspace.tsx | 139 |
| pages/licensing/OnboardingWorkspace | Search | — | Yes | src/pages/licensing/OnboardingWorkspace.tsx | 201 |
| pages/licensing/RegulatoryRequestsRegister | Open | — | Yes | src/pages/licensing/RegulatoryRequestsRegister.tsx | 157 |
| pages/Login | Verify & Continue | — | Yes | src/pages/Login.tsx | 181 |
| pages/Login | Resend code | — | Yes | src/pages/Login.tsx | 185 |
| pages/Login | Cancel and sign out | — | Yes | src/pages/Login.tsx | 195 |
| pages/MailSms | Send Message | notification_management.create | Yes | src/pages/MailSms.tsx | 70 |
| pages/MyWork | All | — | Yes | src/pages/MyWork.tsx | 76 |
| pages/NewApplication | Go to My Applications | — | Yes | src/pages/NewApplication.tsx | 1766 |
| pages/NewApplication | Back | — | Yes | src/pages/NewApplication.tsx | 1769 |
| pages/NewApplication | Proceed to Forms | — | Yes | src/pages/NewApplication.tsx | 1962 |
| pages/NewApplication | Review Entered Data | — | Yes | src/pages/NewApplication.tsx | 2049 |
| pages/NewApplication | Close Review | application_management.edit | Yes | src/pages/NewApplication.tsx | 2086 |
| pages/NewApplication | Back | application_management.create | Yes | src/pages/NewApplication.tsx | 2093 |
| pages/NewApplication | {allFormsCompleted ? 'Continue' : `Complete all forms ($ /$ )`} | application_management.create | Yes | src/pages/NewApplication.tsx | 2096 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2182 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2202 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2248 |
| pages/NewApplication | Continue to Review | — | No | src/pages/NewApplication.tsx | 2251 |
| pages/NewApplication | Retry Payment | — | Yes | src/pages/NewApplication.tsx | 2412 |
| pages/NewApplication | Back to Review | — | Yes | src/pages/NewApplication.tsx | 2421 |
| pages/NewApplication | Back to Documents | — | Yes | src/pages/NewApplication.tsx | 2512 |
| pages/NewApplication | Continue to Payment | — | No | src/pages/NewApplication.tsx | 2516 |
| pages/NewPostLicenseApplication | View my applications | — | Yes | src/pages/NewPostLicenseApplication.tsx | 248 |
| pages/NewPostLicenseApplication | View my licences | — | Yes | src/pages/NewPostLicenseApplication.tsx | 249 |
| pages/NewPostLicenseApplication | Open existing request | — | Yes | src/pages/NewPostLicenseApplication.tsx | 349 |
| pages/NewPostLicenseApplication | Proceed to Application | — | Yes | src/pages/NewPostLicenseApplication.tsx | 357 |
| pages/notifications/NotificationCenter | Export | — | No | src/pages/notifications/NotificationCenter.tsx | 166 |
| pages/notifications/NotificationCenter | Refresh | — | Yes | src/pages/notifications/NotificationCenter.tsx | 169 |
| pages/notifications/NotificationCenter | Mark all read | — | Yes | src/pages/notifications/NotificationCenter.tsx | 173 |
| pages/notifications/NotificationCenter | Mark read | — | No | src/pages/notifications/NotificationCenter.tsx | 274 |
| pages/notifications/NotificationCenter | Dismiss | — | No | src/pages/notifications/NotificationCenter.tsx | 285 |
| pages/notifications/NotificationCenter | Archive | — | No | src/pages/notifications/NotificationCenter.tsx | 294 |
| pages/notifications/NotificationCenter | Export selected | — | No | src/pages/notifications/NotificationCenter.tsx | 305 |
| pages/notifications/NotificationCenter | Try again | — | Yes | src/pages/notifications/NotificationCenter.tsx | 324 |
| pages/notifications/NotificationCenter | Clear filters | — | Yes | src/pages/notifications/NotificationCenter.tsx | 338 |
| pages/notifications/NotificationCenter | Load more | — | Yes | src/pages/notifications/NotificationCenter.tsx | 427 |
| pages/payments/PaymentHistory | View | — | Yes | src/pages/payments/PaymentHistory.tsx | 435 |
| pages/PostLicense | Save as Draft | application_management.edit | Yes | src/pages/PostLicense.tsx | 108 |
| pages/PostLicense | Submit Request | application_management.edit | Yes | src/pages/PostLicense.tsx | 109 |
| pages/PostLicenseApplicationForms | Review Entered Data | application_management.edit | Yes | src/pages/PostLicenseApplicationForms.tsx | 629 |
| pages/PostLicenseApplicationForms | Review Application | application_management.edit | Yes | src/pages/PostLicenseApplicationForms.tsx | 637 |
| pages/PostLicenseApplicationForms | Back to Forms | — | Yes | src/pages/PostLicenseApplicationForms.tsx | 684 |
| pages/PostLicenseApplicationForms | Back to Review | — | Yes | src/pages/PostLicenseApplicationForms.tsx | 715 |
| pages/PreLicense | Save as Draft | application_management.edit | Yes | src/pages/PreLicense.tsx | 310 |
| pages/PreLicense | Continue to Next Section | — | Yes | src/pages/PreLicense.tsx | 311 |
| pages/PreLicenseeDashboard | New Application | application_management.create | Yes | src/pages/PreLicenseeDashboard.tsx | 128 |
| pages/Profile | Save Changes | user_management.edit | Yes | src/pages/Profile.tsx | 275 |
| pages/Profile | Change Photo | user_management.edit | Yes | src/pages/Profile.tsx | 293 |
| pages/Profile | Manage | user_management.edit | Yes | src/pages/Profile.tsx | 376 |
| pages/Profile | Close | user_management.edit | Yes | src/pages/Profile.tsx | 460 |
| pages/Profile | Sign out of all other sessions | user_management.edit | Yes | src/pages/Profile.tsx | 461 |
| pages/prudential/ActionsList | Sweep overdue | prudential_supervision.create | No | src/pages/prudential/ActionsList.tsx | 63 |
| pages/prudential/ActionsList | Sweep breaches | prudential_supervision.create | No | src/pages/prudential/ActionsList.tsx | 67 |
| pages/prudential/ActionsList | New action | prudential_supervision.create | Yes | src/pages/prudential/ActionsList.tsx | 71 |
| pages/prudential/ActionsList | Open | — | Yes | src/pages/prudential/ActionsList.tsx | 156 |
| pages/prudential/AssessmentsList | New assessment | prudential_supervision.create | Yes | src/pages/prudential/AssessmentsList.tsx | 34 |
| pages/prudential/AssessmentWorkspace | Back to prudential work | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 147 |
| pages/prudential/AssessmentWorkspace | Prudential work | — | No | src/pages/prudential/AssessmentWorkspace.tsx | 157 |
| pages/prudential/AssessmentWorkspace | Return to current step | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 186 |
| pages/prudential/AssessmentWorkspace | Resolve | — | No | src/pages/prudential/AssessmentWorkspace.tsx | 221 |
| pages/prudential/AssessmentWorkspace | Raise action | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 388 |
| pages/prudential/AssessmentWorkspace | Raise action | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 428 |
| pages/prudential/EscalationsList | New escalation | prudential_supervision.create | Yes | src/pages/prudential/EscalationsList.tsx | 53 |
| pages/prudential/EscalationsList | All | — | Yes | src/pages/prudential/EscalationsList.tsx | 60 |
| pages/prudential/EscalationsList | Review | prudential_supervision.view | Yes | src/pages/prudential/EscalationsList.tsx | 96 |
| pages/prudential/EscalationsList | Resolve | prudential_supervision.edit | Yes | src/pages/prudential/EscalationsList.tsx | 98 |
| pages/prudential/EscalationsList | Back | — | Yes | src/pages/prudential/EscalationsList.tsx | 120 |
| pages/prudential/ExaminationsList | New examination | prudential_supervision.create | Yes | src/pages/prudential/ExaminationsList.tsx | 98 |
| pages/prudential/ExaminationWorkspace | Examinations | — | No | src/pages/prudential/ExaminationWorkspace.tsx | 249 |
| pages/prudential/ExaminationWorkspace | Open | — | Yes | src/pages/prudential/ExaminationWorkspace.tsx | 468 |
| pages/prudential/FinancialGroupProfile | All groups | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 122 |
| pages/prudential/FinancialGroupProfile | Recompute | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 146 |
| pages/prudential/FinancialGroupProfile | Refresh | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 155 |
| pages/prudential/FinancialGroupProfile | Add member | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 226 |
| pages/prudential/FinancialGroupProfile | Methodology | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 256 |
| pages/prudential/FinancialGroupProfile | Record exposure | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 287 |
| pages/prudential/FinancialGroupProfile | Edit | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 331 |
| pages/prudential/FinancialGroupProfile | Remove | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 495 |
| pages/prudential/FinancialGroupProfile | Cancel | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 503 |
| pages/prudential/FinancialGroupProfile | Save | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 504 |
| pages/prudential/FinancialGroupProfile | Cancel | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 584 |
| pages/prudential/FinancialGroupProfile | Save | — | No | src/pages/prudential/FinancialGroupProfile.tsx | 585 |
| pages/prudential/FinancialGroupProfile | Cancel | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 685 |
| pages/prudential/FinancialGroupsList | New group | — | No | src/pages/prudential/FinancialGroupsList.tsx | 59 |
| pages/prudential/FinancialGroupsList | Cancel | — | Yes | src/pages/prudential/FinancialGroupsList.tsx | 78 |
| pages/prudential/PaymentOperatorProfile | Oversight | prudential_supervision.create | No | src/pages/prudential/PaymentOperatorProfile.tsx | 62 |
| pages/prudential/PaymentOperatorProfile | Edit | prudential_supervision.create | No | src/pages/prudential/PaymentOperatorProfile.tsx | 80 |
| pages/prudential/PaymentOperatorProfile | Start PFMI assessment | prudential_supervision.create | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 83 |
| pages/prudential/PaymentOperatorProfile | Open | — | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 158 |
| pages/prudential/PfmiAssessmentWizard | Back to oversight | — | Yes | src/pages/prudential/PfmiAssessmentWizard.tsx | 98 |
| pages/prudential/PfmiAssessmentWizard | Previous | — | Yes | src/pages/prudential/PfmiAssessmentWizard.tsx | 196 |
| pages/prudential/PfmiAssessmentWizard | Save &amp; next | — | No | src/pages/prudential/PfmiAssessmentWizard.tsx | 200 |
| pages/prudential/PrudentialDashboard | Open work queue | — | Yes | src/pages/prudential/PrudentialDashboard.tsx | 61 |
| pages/prudential/PrudentialEntityProfile | Back to Entities | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 275 |
| pages/prudential/PrudentialEntityProfile | Open Entity 360 | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 292 |
| pages/prudential/PrudentialEntityProfile | Open work queue | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 295 |
| pages/prudential/PrudentialEntityProfile | Export | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 298 |
| pages/prudential/PrudentialEntityProfile | History | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 299 |
| pages/prudential/PrudentialEntityProfile | Evaluate stress | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 466 |
| pages/prudential/PrudentialEntityProfile | All | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 564 |
| pages/prudential/PrudentialEntityProfile | None | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 565 |
| pages/prudential/PrudentialEntityProfile | Create action | prudential_supervision.create | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 705 |
| pages/prudential/PrudentialEntityProfile | Escalate | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 711 |
| pages/prudential/PrudentialEntityProfile | Open return | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 952 |
| pages/prudential/PrudentialTaxonomyAdmin | New category | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialTaxonomyAdmin.tsx | 56 |
| pages/prudential/PrudentialTaxonomyAdmin | Cancel | — | Yes | src/pages/prudential/PrudentialTaxonomyAdmin.tsx | 90 |
| pages/prudential/PrudentialTaxonomyAdmin | Edit | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialTaxonomyAdmin.tsx | 115 |
| pages/prudential/PrudentialTaxonomyAdmin | Deactivate | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialTaxonomyAdmin.tsx | 119 |
| pages/prudential/PrudentialTaxonomyAdmin | Reactivate | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialTaxonomyAdmin.tsx | 121 |
| pages/prudential/PrudentialWorkQueue | Clear filters | — | Yes | src/pages/prudential/PrudentialWorkQueue.tsx | 168 |
| pages/prudential/PrudentialWorkQueue | Previous | — | Yes | src/pages/prudential/PrudentialWorkQueue.tsx | 252 |
| pages/prudential/PrudentialWorkQueue | Next | — | Yes | src/pages/prudential/PrudentialWorkQueue.tsx | 253 |
| pages/prudential/StressIndicatorsAdmin | New indicator | prudential_supervision.create | Yes | src/pages/prudential/StressIndicatorsAdmin.tsx | 87 |
| pages/prudential/StressIndicatorsAdmin | Edit | prudential_supervision.edit | Yes | src/pages/prudential/StressIndicatorsAdmin.tsx | 165 |
| pages/prudential/StressIndicatorsAdmin | Deactivate | prudential_supervision.edit | Yes | src/pages/prudential/StressIndicatorsAdmin.tsx | 166 |
| pages/public/ApplicantGuidance | Start New Application | — | No | src/pages/public/ApplicantGuidance.tsx | 42 |
| pages/public/ApplicantGuidance | Licensee Services | — | No | src/pages/public/ApplicantGuidance.tsx | 44 |
| pages/public/ApplicantGuidance | View Licensee Services | — | Yes | src/pages/public/ApplicantGuidance.tsx | 78 |
| pages/public/ApplicantGuidance | Connect to Existing Entity | — | No | src/pages/public/ApplicantGuidance.tsx | 79 |
| pages/public/ApplicantGuidance | Guidance | — | No | src/pages/public/ApplicantGuidance.tsx | 90 |
| pages/public/ApplicantGuidance | Help / Contact | — | No | src/pages/public/ApplicantGuidance.tsx | 91 |
| pages/public/DeclarationLanding | Verify Identity | — | Yes | src/pages/public/DeclarationLanding.tsx | 255 |
| pages/public/LicenseeServiceDetail | Regulatory guidance | — | No | src/pages/public/LicenseeServiceDetail.tsx | 136 |
| pages/public/LicenseeServiceDetail | Help / Contact | — | No | src/pages/public/LicenseeServiceDetail.tsx | 137 |
| pages/public/LicenseeServiceDetail | Connect to Existing Entity | — | No | src/pages/public/LicenseeServiceDetail.tsx | 138 |
| pages/public/LicenseeServices | Connect to an Existing Entity | — | No | src/pages/public/LicenseeServices.tsx | 54 |
| pages/public/LicenseeServices | Start a New Application | — | No | src/pages/public/LicenseeServices.tsx | 64 |
| pages/public/LicenseeServices | View process | — | Yes | src/pages/public/LicenseeServices.tsx | 107 |
| pages/public/LicenseeServices | Guidance | — | No | src/pages/public/LicenseeServices.tsx | 149 |
| pages/public/LicenseeServices | Help / Contact | — | No | src/pages/public/LicenseeServices.tsx | 150 |
| pages/public/PublicComplaintIntake | Already made a complaint? Track it here | — | No | src/pages/public/PublicComplaintIntake.tsx | 50 |
| pages/public/PublicEnforcement | Previous | — | Yes | src/pages/public/PublicEnforcement.tsx | 82 |
| pages/public/PublicEnforcement | Next | — | Yes | src/pages/public/PublicEnforcement.tsx | 83 |
| pages/public/PublicEntityRegister | Search | — | Yes | src/pages/public/PublicEntityRegister.tsx | 51 |
| pages/public/PublicEntityRegister | Previous | — | Yes | src/pages/public/PublicEntityRegister.tsx | 110 |
| pages/public/PublicEntityRegister | Next | — | Yes | src/pages/public/PublicEntityRegister.tsx | 112 |
| pages/public/PublicGuidance | Open | — | Yes | src/pages/public/PublicGuidance.tsx | 61 |
| pages/public/PublicHelp | Licensee Services | — | No | src/pages/public/PublicHelp.tsx | 34 |
| pages/public/PublicHelp | Connect to Existing Entity | — | No | src/pages/public/PublicHelp.tsx | 63 |
| pages/public/PublicHelp | Start a New Application | — | No | src/pages/public/PublicHelp.tsx | 64 |
| pages/public/PublicHelp | Forgot password | — | Yes | src/pages/public/PublicHelp.tsx | 76 |
| pages/public/PublicLicenseeDetail | Request / Connect Portal Access | — | No | src/pages/public/PublicLicenseeDetail.tsx | 123 |
| pages/public/PublicLicenseeDetail | Licensee services | — | No | src/pages/public/PublicLicenseeDetail.tsx | 128 |
| pages/public/PublicLicensees | Search | — | Yes | src/pages/public/PublicLicensees.tsx | 61 |
| pages/public/PublicLicensees | Previous | — | Yes | src/pages/public/PublicLicensees.tsx | 101 |
| pages/public/PublicLicensees | Next | — | Yes | src/pages/public/PublicLicensees.tsx | 102 |
| pages/PublicComplaintTracking | Make a new complaint | — | No | src/pages/PublicComplaintTracking.tsx | 48 |
| pages/registration/EntityIdentification | Create an account | — | No | src/pages/registration/EntityIdentification.tsx | 107 |
| pages/registration/EntityIdentification | Sign in | — | Yes | src/pages/registration/EntityIdentification.tsx | 110 |
| pages/registration/EntityIdentification | Identify entity | — | No | src/pages/registration/EntityIdentification.tsx | 241 |
| pages/registration/EntityIdentification | Request access to this entity | — | No | src/pages/registration/EntityIdentification.tsx | 291 |
| pages/registration/EntityIdentification | Create provisional entity and request access | — | No | src/pages/registration/EntityIdentification.tsx | 299 |
| pages/registration/EntityIdentification | Change details | — | No | src/pages/registration/EntityIdentification.tsx | 314 |
| pages/registration/PreLicenseeRegistration | Try again | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1405 |
| pages/registration/PreLicenseeRegistration | Try again | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1430 |
| pages/registration/PreLicenseeRegistration | Back to Home | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1451 |
| pages/registration/PreLicenseeRegistration | Refresh | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1452 |
| pages/registration/PreLicenseeRegistration | Previous | registration_management.create | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1546 |
| pages/registration/PreLicenseeRegistration | {submitting ? ( Submitting... ) : ( )} | registration_management.create | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1565 |
| pages/registration/RegistrationJourneyChoice | Try again | — | Yes | src/pages/registration/RegistrationJourneyChoice.tsx | 91 |
| pages/registration/RegistrationJourneyChoice | Sign in | — | Yes | src/pages/registration/RegistrationJourneyChoice.tsx | 94 |
| pages/registration/RegistrationJourneyChoice | {JOURNEY_CTA[j.key] ?? `Continue — $ `} | — | No | src/pages/registration/RegistrationJourneyChoice.tsx | 147 |
| pages/registration/RegistrationPortal | Sign Out | — | Yes | src/pages/registration/RegistrationPortal.tsx | 259 |
| pages/registration/RegistrationStatusPage | Update & Resubmit Registration | registration_management.edit | Yes | src/pages/registration/RegistrationStatusPage.tsx | 80 |
| pages/registration/RegistrationStatusPage | Continue Verification | registration_management.edit | Yes | src/pages/registration/RegistrationStatusPage.tsx | 90 |
| pages/registration/RegistrationStatusPage | Go to Dashboard | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 97 |
| pages/registration/RegistrationStatusPage | Refresh | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 103 |
| pages/registration/RegistrationStatusPage | Sign Out | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 106 |
| pages/registration/UserAccountStep | Send verification code | — | Yes | src/pages/registration/UserAccountStep.tsx | 188 |
| pages/registration/UserAccountStep | Resend code | — | Yes | src/pages/registration/UserAccountStep.tsx | 207 |
| pages/registration/UserAccountStep | Create account and continue | — | No | src/pages/registration/UserAccountStep.tsx | 224 |
| pages/registration/VerificationPending | Back to Home | — | Yes | src/pages/registration/VerificationPending.tsx | 34 |
| pages/reports/components/AdHocReportBuilder | ( ) | report_management.edit | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 277 |
| pages/reports/components/AdHocReportBuilder | Reset | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 332 |
| pages/reports/components/AdHocReportBuilder | Save Template | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 336 |
| pages/reports/components/AdHocReportBuilder | Load | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 363 |
| pages/reports/components/AdHocReportBuilder | Save | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 386 |
| pages/reports/components/ReportHistory | View | report_management.edit | Yes | src/pages/reports/components/ReportHistory.tsx | 168 |
| pages/reports/components/ReportHistory | Re-run | report_management.edit | Yes | src/pages/reports/components/ReportHistory.tsx | 178 |
| pages/reports/components/ReportLibrary | Favorites | report_management.edit | Yes | src/pages/reports/components/ReportLibrary.tsx | 112 |
| pages/reports/components/ReportLibrary | Schedule | report_management.edit | Yes | src/pages/reports/components/ReportLibrary.tsx | 146 |
| pages/reports/components/ReportPreviewDialog | PDF | report_management.view | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 188 |
| pages/reports/components/ReportPreviewDialog | Print | report_management.view | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 200 |
| pages/reports/components/ReportPreviewDialog | Prev | report_management.edit | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 242 |
| pages/reports/components/ReportPreviewDialog | Next | — | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 243 |
| pages/reports/ReportPage | Generate Report | report_management.view | Yes | src/pages/reports/ReportPage.tsx | 76 |
| pages/reports/ReportPage | Apply Filters | — | Yes | src/pages/reports/ReportPage.tsx | 108 |
| pages/reports/ReportsDashboard | Schedule Report | report_management.configure | Yes | src/pages/reports/ReportsDashboard.tsx | 41 |
| pages/reports/ReportsDashboard | New Report | report_management.create | Yes | src/pages/reports/ReportsDashboard.tsx | 44 |
| pages/ResetPassword | Request New Link | — | Yes | src/pages/ResetPassword.tsx | 118 |
| pages/ResetPassword | Back to Sign In | — | Yes | src/pages/ResetPassword.tsx | 121 |
| pages/ResetPassword | Sign In | — | Yes | src/pages/ResetPassword.tsx | 195 |
| pages/returns-canonical/EntityObligationsWorkbench | Re-derive obligations | — | No | src/pages/returns-canonical/EntityObligationsWorkbench.tsx | 60 |
| pages/returns-canonical/EntityObligationsWorkbench | Generate | — | No | src/pages/returns-canonical/EntityObligationsWorkbench.tsx | 112 |
| pages/returns-canonical/EntityPicker | Change entity | — | No | src/pages/returns-canonical/EntityPicker.tsx | 35 |
| pages/returns-canonical/EntityReportingCalendar | Open | — | Yes | src/pages/returns-canonical/EntityReportingCalendar.tsx | 97 |
| pages/returns-canonical/EntityReportingCalendar | Start filing | — | No | src/pages/returns-canonical/EntityReportingCalendar.tsx | 99 |
| pages/returns-canonical/FilingDetail | Assign | — | No | src/pages/returns-canonical/FilingDetail.tsx | 149 |
| pages/returns-canonical/FilingDetail | Submit response | — | No | src/pages/returns-canonical/FilingDetail.tsx | 431 |
| pages/returns-canonical/RegulatoryMetricsAdmin | New metric | — | No | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 75 |
| pages/returns-canonical/RegulatoryMetricsAdmin | Cancel | — | Yes | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 198 |
| pages/returns-canonical/RegulatoryMetricsAdmin | Save metric | — | No | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 199 |
| pages/returns-mgmt/ManageRules | Add Rule | returns_management.configure | Yes | src/pages/returns-mgmt/ManageRules.tsx | 45 |
| pages/returns-mgmt/ManageScheduling | New Schedule | returns_management.configure | Yes | src/pages/returns-mgmt/ManageScheduling.tsx | 48 |
| pages/returns-mgmt/ManageStructures | New Structure | returns_management.configure | Yes | src/pages/returns-mgmt/ManageStructures.tsx | 45 |
| pages/returns-mgmt/ManageValidations | Add Rule | returns_management.edit | Yes | src/pages/returns-mgmt/ManageValidations.tsx | 191 |
| pages/returns-mgmt/ManageValidations | Cancel | returns_management.edit | Yes | src/pages/returns-mgmt/ManageValidations.tsx | 303 |
| pages/returns-mgmt/ManageValidations | Save | returns_management.edit | Yes | src/pages/returns-mgmt/ManageValidations.tsx | 304 |
| pages/returns-mgmt/ManageValidations | Rollback | returns_management.edit | Yes | src/pages/returns-mgmt/ManageValidations.tsx | 329 |
| pages/returns-mgmt/PrudentialRatios | Add Ratio | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialRatios.tsx | 172 |
| pages/returns-mgmt/PrudentialRatios | Rollback | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialRatios.tsx | 227 |
| pages/returns-mgmt/PrudentialThresholds | Add Threshold | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialThresholds.tsx | 157 |
| pages/returns-mgmt/PrudentialThresholds | Cancel | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialThresholds.tsx | 209 |
| pages/returns-mgmt/PrudentialThresholds | Save | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialThresholds.tsx | 210 |
| pages/returns-mgmt/PrudentialThresholds | Rollback | prudential_supervision.edit | Yes | src/pages/returns-mgmt/PrudentialThresholds.tsx | 237 |
| pages/returns-mgmt/ReturnAnalysis | Back | report_management.view | Yes | src/pages/returns-mgmt/ReturnAnalysis.tsx | 149 |
| pages/returns-mgmt/ReturnAnalysis | Regenerate | report_management.view | Yes | src/pages/returns-mgmt/ReturnAnalysis.tsx | 152 |
| pages/returns-mgmt/ReturnAnalysis | Generate Analysis | report_management.view | Yes | src/pages/returns-mgmt/ReturnAnalysis.tsx | 168 |
| pages/returns-mgmt/ReturnDetail | Back to Returns | returns_management.view | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 617 |
| pages/returns-mgmt/ReturnDetail | History | returns_management.view | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 621 |
| pages/returns-mgmt/ReturnDetail | Compare Versions {revisions.length > 0 && } | returns_management.view | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 625 |
| pages/returns-mgmt/ReturnDetail | View Analysis | report_management.view | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 638 |
| pages/returns-mgmt/ReturnDetail | Allow Edit | returns_management.approve | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 726 |
| pages/returns-mgmt/ReturnDetail | Deny Request | returns_management.reject | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 751 |
| pages/returns-mgmt/ReturnDetail | Approve Return | returns_management.approve | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 868 |
| pages/returns-mgmt/ReturnDetail | Request Edit | returns_management.reject | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 878 |
| pages/returns-mgmt/ReturnGroups | Create Group | returns_management.configure | Yes | src/pages/returns-mgmt/ReturnGroups.tsx | 45 |
| pages/returns-mgmt/ViewReturns | Clear filter | — | Yes | src/pages/returns-mgmt/ViewReturns.tsx | 246 |
| pages/returns-mgmt/ViewReturns | Export | returns_management.export | Yes | src/pages/returns-mgmt/ViewReturns.tsx | 274 |
| pages/Returns | View Calendar | — | Yes | src/pages/Returns.tsx | 144 |
| pages/Returns | View Overdue | — | Yes | src/pages/Returns.tsx | 189 |
| pages/Returns | Filters | — | Yes | src/pages/Returns.tsx | 217 |
| pages/settings/ApplicationFormSettings | Send | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 136 |
| pages/settings/ApplicationFormSettings | Back | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 170 |
| pages/settings/ApplicationFormSettings | Save Changes | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 173 |
| pages/settings/BrandingSettings | Back | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 118 |
| pages/settings/BrandingSettings | Save Changes | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 119 |
| pages/settings/BrandingSettings | Upload | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 163 |
| pages/settings/BrandingSettings | Upload | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 193 |
| pages/settings/BrandingSettings | Add Link | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 222 |
| pages/settings/BrandingSettings | Add Link | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 271 |
| pages/settings/BrandingSettings | Add Social | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 297 |
| pages/settings/CaptchaSettings | Add configuration | — | No | src/pages/settings/CaptchaSettings.tsx | 270 |
| pages/settings/CaptchaSettings | Activate | — | No | src/pages/settings/CaptchaSettings.tsx | 317 |
| pages/settings/CaptchaSettings | Edit | — | No | src/pages/settings/CaptchaSettings.tsx | 321 |
| pages/settings/CaptchaSettings | Cancel | — | Yes | src/pages/settings/CaptchaSettings.tsx | 452 |
| pages/settings/CaptchaSettings | Save | — | No | src/pages/settings/CaptchaSettings.tsx | 453 |
| pages/settings/CertificateSignatorySettings | Back | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 214 |
| pages/settings/CertificateSignatorySettings | Save Changes | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 217 |
| pages/settings/CertificateSignatorySettings | Remove | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 346 |
| pages/settings/DataManagementSettings | Back | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 25 |
| pages/settings/DataManagementSettings | Save Changes | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 26 |
| pages/settings/DataManagementSettings | Export Database | settings.export | Yes | src/pages/settings/DataManagementSettings.tsx | 62 |
| pages/settings/DataManagementSettings | Export Audit Logs | settings.export | Yes | src/pages/settings/DataManagementSettings.tsx | 74 |
| pages/settings/DataManagementSettings | Purge | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 121 |
| pages/settings/EmailSmsSettings | Back | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 140 |
| pages/settings/EmailSmsSettings | Save Changes | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 143 |
| pages/settings/EmailSmsSettings | Send Test Email | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 251 |
| pages/settings/GeneralSettings | Back | settings.edit | Yes | src/pages/settings/GeneralSettings.tsx | 51 |
| pages/settings/GeneralSettings | Save Changes | settings.edit | Yes | src/pages/settings/GeneralSettings.tsx | 52 |
| pages/settings/IntegrationSettings | Back | — | Yes | src/pages/settings/IntegrationSettings.tsx | 259 |
| pages/settings/IntegrationSettings | Refresh | — | Yes | src/pages/settings/IntegrationSettings.tsx | 262 |
| pages/settings/IntegrationSettings | Test | — | Yes | src/pages/settings/IntegrationSettings.tsx | 353 |
| pages/settings/IntegrationSettings | Configure | — | Yes | src/pages/settings/IntegrationSettings.tsx | 359 |
| pages/settings/IntegrationSettings | Save threshold | — | Yes | src/pages/settings/IntegrationSettings.tsx | 483 |
| pages/settings/IntegrationSettings | Cancel | — | Yes | src/pages/settings/IntegrationSettings.tsx | 600 |
| pages/settings/IntegrationSettings | Save | — | No | src/pages/settings/IntegrationSettings.tsx | 601 |
| pages/settings/IntegrationSettings | Cancel | — | Yes | src/pages/settings/IntegrationSettings.tsx | 665 |
| pages/settings/IntegrationSettings | Rotate | — | No | src/pages/settings/IntegrationSettings.tsx | 666 |
| pages/settings/IntegrationSettings | Cancel | — | Yes | src/pages/settings/IntegrationSettings.tsx | 725 |
| pages/settings/LicenseExpirySettings | Back | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 264 |
| pages/settings/LicenseExpirySettings | Add Rule | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 267 |
| pages/settings/LicenseExpirySettings | Add your first rule | — | No | src/pages/settings/LicenseExpirySettings.tsx | 289 |
| pages/settings/LicenseExpirySettings | View | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 326 |
| pages/settings/LicenseExpirySettings | Edit | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 329 |
| pages/settings/LicenseExpirySettings | Save Rule | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 445 |
| pages/settings/NotificationSettings | Back | — | Yes | src/pages/settings/NotificationSettings.tsx | 17 |
| pages/settings/PaymentSettings | Back | settings.edit | Yes | src/pages/settings/PaymentSettings.tsx | 27 |
| pages/settings/PaymentSettings | Save Changes | settings.edit | Yes | src/pages/settings/PaymentSettings.tsx | 28 |
| pages/settings/PaymentSettings | Go to Fee Management | — | Yes | src/pages/settings/PaymentSettings.tsx | 85 |
| pages/settings/ScheduleSettings | Back | settings.edit | Yes | src/pages/settings/ScheduleSettings.tsx | 40 |
| pages/settings/ScheduleSettings | Save Changes | settings.edit | Yes | src/pages/settings/ScheduleSettings.tsx | 41 |
| pages/settings/ScheduleSettings | Add Holiday | settings.edit | Yes | src/pages/settings/ScheduleSettings.tsx | 94 |
| pages/settings/SecuritySettings | Back | settings.edit | Yes | src/pages/settings/SecuritySettings.tsx | 22 |
| pages/settings/SecuritySettings | Save Changes | settings.edit | Yes | src/pages/settings/SecuritySettings.tsx | 23 |
| pages/StatementReports | Generate Statement | report_management.view | Yes | src/pages/StatementReports.tsx | 27 |
| pages/StatementReports | PDF | report_management.export | Yes | src/pages/StatementReports.tsx | 73 |
| pages/supervision/BreachInbox | Ack | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 324 |
| pages/supervision/BreachInbox | Escalate | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 327 |
| pages/supervision/BreachInbox | Cancel | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 363 |
| pages/supervision/BreachInbox | Acknowledge | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 364 |
| pages/supervision/BreachInbox | Cancel | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 424 |
| pages/supervision/BreachInbox | Create enforcement case | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 425 |
| pages/supervision/NewThematicReview | Back | prudential_supervision.create | Yes | src/pages/supervision/NewThematicReview.tsx | 202 |
| pages/supervision/NewThematicReview | Next | prudential_supervision.create | Yes | src/pages/supervision/NewThematicReview.tsx | 204 |
| pages/supervision/NewThematicReview | Create Review | prudential_supervision.create | Yes | src/pages/supervision/NewThematicReview.tsx | 206 |
| pages/supervision/PrudentialEarlyWarnings | Recompute | prudential_supervision.edit | Yes | src/pages/supervision/PrudentialEarlyWarnings.tsx | 130 |
| pages/supervision/PrudentialEarlyWarnings | Export CSV | prudential_supervision.export | Yes | src/pages/supervision/PrudentialEarlyWarnings.tsx | 134 |
| pages/supervision/PrudentialEarlyWarnings | Open | prudential_supervision.edit | Yes | src/pages/supervision/PrudentialEarlyWarnings.tsx | 217 |
| pages/supervision/PrudentialEarlyWarnings | Seed action | prudential_supervision.edit | Yes | src/pages/supervision/PrudentialEarlyWarnings.tsx | 218 |
| pages/supervision/RiskHeatmap | Recompute now | prudential_supervision.edit | Yes | src/pages/supervision/RiskHeatmap.tsx | 111 |
| pages/supervision/SupervisoryPlansDashboard | Reassign | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 290 |
| pages/supervision/SupervisoryPlansDashboard | Extend due | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 291 |
| pages/supervision/SupervisoryPlansDashboard | Mark complete | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 292 |
| pages/supervision/SupervisoryPlansDashboard | Clear | — | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 293 |
| pages/supervision/SupervisoryPlansDashboard | Submit | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 354 |
| pages/supervision/SupervisoryPlansDashboard | Approve | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 359 |
| pages/supervision/SupervisoryPlansDashboard | Cancel | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 389 |
| pages/supervision/SupervisoryPlansDashboard | Reassign | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 390 |
| pages/supervision/SupervisoryPlansDashboard | Cancel | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 405 |
| pages/supervision/SupervisoryPlansDashboard | Extend | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 406 |
| pages/supervision/SupervisoryPlansDashboard | Cancel | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 443 |
| pages/supervision/SupervisoryPlansDashboard | Mark complete | prudential_supervision.edit | Yes | src/pages/supervision/SupervisoryPlansDashboard.tsx | 444 |
| pages/supervision/ThematicClosureQueue | Review report | — | No | src/pages/supervision/ThematicClosureQueue.tsx | 49 |
| pages/supervision/ThematicClosureQueue | Open | — | Yes | src/pages/supervision/ThematicClosureQueue.tsx | 91 |
| pages/supervision/ThematicReviewDetail | Move back | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 121 |
| pages/supervision/ThematicReviewDetail | Advance → | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 126 |
| pages/supervision/ThematicReviewDetail | Cancel | — | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 224 |
| pages/supervision/ThematicReviewDetail | Confirm | — | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 225 |
| pages/supervision/ThematicReviewDetail | Remove | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 322 |
| pages/supervision/ThematicReviewDetail | Remove | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 342 |
| pages/supervision/ThematicReviewDetail | Add evidence | prudential_supervision.create | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 394 |
| pages/supervision/ThematicReviewDetail | Add finding | prudential_supervision.create | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 480 |
| pages/supervision/ThematicReviewDetail | Issue | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 500 |
| pages/supervision/ThematicReviewDetail | Add action | prudential_supervision.create | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 582 |
| pages/supervision/ThematicReviewDetail | Complete | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 604 |
| pages/supervision/ThematicReviewDetail | Waive | prudential_supervision.edit | Yes | src/pages/supervision/ThematicReviewDetail.tsx | 605 |
| pages/supervision/ThematicReviews | New Review | prudential_supervision.create | Yes | src/pages/supervision/ThematicReviews.tsx | 85 |
| pages/supervision/ThematicReviews | Open | — | Yes | src/pages/supervision/ThematicReviews.tsx | 153 |
| pages/UploadReturns | Browse Files | — | Yes | src/pages/UploadReturns.tsx | 78 |
| pages/workflows/WorkflowList | Templates | workflow_management.create | Yes | src/pages/workflows/WorkflowList.tsx | 800 |
| pages/workflows/WorkflowList | New Workflow | workflow_management.create | Yes | src/pages/workflows/WorkflowList.tsx | 803 |
| pages/workflows/WorkflowList | Create First Workflow | workflow_management.create | Yes | src/pages/workflows/WorkflowList.tsx | 848 |
| pages/workflows/WorkflowList | Builder | — | Yes | src/pages/workflows/WorkflowList.tsx | 940 |
| pages/workflows/WorkflowList | Save as Template | workflow_management.create | Yes | src/pages/workflows/WorkflowList.tsx | 988 |
| pages/workflows/WorkflowList | Edit Steps | workflow_management.edit | Yes | src/pages/workflows/WorkflowList.tsx | 992 |
| pages/workflows/WorkflowList | Add Step | workflow_management.edit | Yes | src/pages/workflows/WorkflowList.tsx | 997 |
| pages/workflows/WorkflowList | Done | — | Yes | src/pages/workflows/WorkflowList.tsx | 1000 |
| pages/workflows/WorkflowList | Cancel | — | Yes | src/pages/workflows/WorkflowList.tsx | 1179 |
| pages/workflows/WorkflowList | Cancel | — | Yes | src/pages/workflows/WorkflowList.tsx | 1296 |
| pages/workflows/WorkflowList | Close | — | Yes | src/pages/workflows/WorkflowList.tsx | 1353 |
| pages/workflows/WorkflowList | Add Step 1 | workflow_management.edit | Yes | src/pages/workflows/WorkflowList.tsx | 1406 |
| pages/workflows/WorkflowList | Add another step | workflow_management.edit | Yes | src/pages/workflows/WorkflowList.tsx | 1439 |
