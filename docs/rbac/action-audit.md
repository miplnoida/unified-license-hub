# RBAC Action Coverage Audit

_Generated: 2026-09-03T15:03:55.119Z_

**Total action sites scanned:** 2186
**Protected:** 2186
**Coverage:** 100%

Any row with **Protected = No** must be wrapped in `<PermissionGate module="..." action="...">` or replaced with `<GuardedButton module="..." action="...">` — or, if intentionally public (login, cancel, close, back, …), added to the allow-list in `scripts/rbac-audit.ts`.

## By category

| Category | Total | Protected | Coverage |
|---|---:|---:|---:|
| Action | 1341 | 1341 | 100% |
| Create | 224 | 224 | 100% |
| View | 149 | 149 | 100% |
| Save | 114 | 114 | 100% |
| Edit | 49 | 49 | 100% |
| Approve | 37 | 37 | 100% |
| Close | 37 | 37 | 100% |
| Submit | 32 | 32 | 100% |
| Export | 31 | 31 | 100% |
| Reject | 21 | 21 | 100% |
| Delete | 19 | 19 | 100% |
| Download | 19 | 19 | 100% |
| Workflow | 17 | 17 | 100% |
| Assign | 14 | 14 | 100% |
| Issue | 14 | 14 | 100% |
| Upload | 12 | 12 | 100% |
| Import | 11 | 11 | 100% |
| Reopen | 11 | 11 | 100% |
| Report | 10 | 10 | 100% |
| Print | 8 | 8 | 100% |
| Configure | 4 | 4 | 100% |
| Email | 3 | 3 | 100% |
| Archive | 3 | 3 | 100% |
| Publish | 3 | 3 | 100% |
| Status Change | 1 | 1 | 100% |
| Bulk | 1 | 1 | 100% |
| Restore | 1 | 1 | 100% |

## Detail

| Page | Button | Permission | Protected | File | Line |
|---|---|---|---|---|---:|
| components/addresses/SubjectAddressPanel | {showHistory ? 'Current only' : `Include $ historical`} | entity_structure.view_history | Yes | src/components/addresses/SubjectAddressPanel.tsx | 91 |
| components/addresses/SubjectAddressPanel | onApprove(u.id)} > Approve | entity_structure.approve | Yes | src/components/addresses/SubjectAddressPanel.tsx | 145 |
| components/addresses/SubjectAddressPanel | onEnd(u.id)} > End usage | entity_structure.apply | Yes | src/components/addresses/SubjectAddressPanel.tsx | 158 |
| components/admin/classification/AuthorizationSchemesTab | setStatusReq( )}> Enable | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 96 |
| components/admin/classification/AuthorizationSchemesTab | setStatusReq( )}> Disable | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 102 |
| components/admin/classification/AuthorizationSchemesTab | setStatusReq( )}> Retire | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 108 |
| components/admin/classification/AuthorizationSchemesTab | History | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 113 |
| components/admin/classification/AuthorizationSchemesTab | Add scheme | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 143 |
| components/admin/classification/AuthorizationSchemesTab | Edit | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 169 |
| components/admin/classification/AuthorizationSchemesTab | Add class | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 178 |
| components/admin/classification/AuthorizationSchemesTab | Edit | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 201 |
| components/admin/classification/AuthorizationSchemesTab | Cancel | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 255 |
| components/admin/classification/AuthorizationSchemesTab | Save | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 256 |
| components/admin/classification/AuthorizationSchemesTab | Cancel | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 310 |
| components/admin/classification/AuthorizationSchemesTab | Save | settings.edit | Yes | src/components/admin/classification/AuthorizationSchemesTab.tsx | 311 |
| components/admin/classification/ClassificationStructureTab | setStatusReq( )}> Enable | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 125 |
| components/admin/classification/ClassificationStructureTab | setStatusReq( )}> Disable | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 131 |
| components/admin/classification/ClassificationStructureTab | setStatusReq( )}> Retire | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 137 |
| components/admin/classification/ClassificationStructureTab | History | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 142 |
| components/admin/classification/ClassificationStructureTab | deleteDraft(type, id, label)}> Delete draft | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 146 |
| components/admin/classification/ClassificationStructureTab | Edit | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 174 |
| components/admin/classification/ClassificationStructureTab | Add local sector | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 196 |
| components/admin/classification/ClassificationStructureTab | Edit | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 237 |
| components/admin/classification/ClassificationStructureTab | Add business type | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 245 |
| components/admin/classification/ClassificationStructureTab | Cancel | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 299 |
| components/admin/classification/ClassificationStructureTab | Save | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 300 |
| components/admin/classification/ClassificationStructureTab | Cancel | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 362 |
| components/admin/classification/ClassificationStructureTab | Save | settings.edit | Yes | src/components/admin/classification/ClassificationStructureTab.tsx | 363 |
| components/admin/classification/StatusChangeDialog | Cancel | — | Yes | src/components/admin/classification/StatusChangeDialog.tsx | 140 |
| components/admin/classification/StatusChangeDialog | Confirm | — | Yes | src/components/admin/classification/StatusChangeDialog.tsx | 141 |
| components/admin/MasterDataImportDialog | Download Sample Excel | settings.export | Yes | src/components/admin/MasterDataImportDialog.tsx | 232 |
| components/admin/MasterDataImportDialog | Choose Excel File | settings.edit | Yes | src/components/admin/MasterDataImportDialog.tsx | 235 |
| components/admin/MasterDataImportDialog | Cancel | settings.edit | Yes | src/components/admin/MasterDataImportDialog.tsx | 291 |
| components/admin/MasterDataImportDialog | {importing ? 'Importing...' : `Import $ row(s)`} | settings.edit | Yes | src/components/admin/MasterDataImportDialog.tsx | 292 |
| components/admin/MasterDataItemsImportDialog | Download Sample Excel | settings.export | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 162 |
| components/admin/MasterDataItemsImportDialog | Choose Excel File | settings.edit | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 165 |
| components/admin/MasterDataItemsImportDialog | Cancel | settings.edit | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 223 |
| components/admin/MasterDataItemsImportDialog | {importing ? 'Importing...' : `Import $ row(s)`} | settings.edit | Yes | src/components/admin/MasterDataItemsImportDialog.tsx | 224 |
| components/admin/operating-structure/AccessStatusNote | Review access | — | Yes | src/components/admin/operating-structure/AccessStatusNote.tsx | 21 |
| components/admin/operating-structure/EntitySupervisionTab | Assign supervision | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 229 |
| components/admin/operating-structure/EntitySupervisionTab | Assign | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 321 |
| components/admin/operating-structure/EntitySupervisionTab | openTransfer(a)}>Transfer | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 389 |
| components/admin/operating-structure/EntitySupervisionTab | closeAssignment(a.id)}>End | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 390 |
| components/admin/operating-structure/EntitySupervisionTab | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 469 |
| components/admin/operating-structure/EntitySupervisionTab | Transfer supervision | user_management.edit | Yes | src/components/admin/operating-structure/EntitySupervisionTab.tsx | 470 |
| components/admin/operating-structure/MandateAdminTab | New mandate | user_management.create | Yes | src/components/admin/operating-structure/MandateAdminTab.tsx | 114 |
| components/admin/operating-structure/MandateAdminTab | Edit | user_management.edit | Yes | src/components/admin/operating-structure/MandateAdminTab.tsx | 129 |
| components/admin/operating-structure/MandateAdminTab | Cancel | — | Yes | src/components/admin/operating-structure/MandateAdminTab.tsx | 265 |
| components/admin/operating-structure/OverviewTab | onNavigate('coverage')}>Assign sector lead | user_management.edit | Yes | src/components/admin/operating-structure/OverviewTab.tsx | 99 |
| components/admin/operating-structure/OverviewTab | Add staff responsibility | user_management.create | Yes | src/components/admin/operating-structure/OverviewTab.tsx | 100 |
| components/admin/operating-structure/OverviewTab | Manage decision bodies | — | Yes | src/components/admin/operating-structure/OverviewTab.tsx | 101 |
| components/admin/operating-structure/OverviewTab | Open sector coverage | — | Yes | src/components/admin/operating-structure/OverviewTab.tsx | 123 |
| components/admin/operating-structure/PanelsCommitteesTab | + Add member | user_management.create | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 201 |
| components/admin/operating-structure/PanelsCommitteesTab | Record policy | user_management.edit | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 314 |
| components/admin/operating-structure/PanelsCommitteesTab | + Add member | user_management.create | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 367 |
| components/admin/operating-structure/PanelsCommitteesTab | Decision rule | user_management.edit | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 374 |
| components/admin/operating-structure/PanelsCommitteesTab | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 476 |
| components/admin/operating-structure/PanelsCommitteesTab | Save decision rule | user_management.edit | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 477 |
| components/admin/operating-structure/PanelsCommitteesTab | Cancel | user_management.create | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 560 |
| components/admin/operating-structure/PanelsCommitteesTab | Add member | user_management.create | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 561 |
| components/admin/operating-structure/PanelsCommitteesTab | Remove | user_management.edit | Yes | src/components/admin/operating-structure/PanelsCommitteesTab.tsx | 591 |
| components/admin/operating-structure/PeopleTab | Manage roles | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 184 |
| components/admin/operating-structure/PeopleTab | Add responsibility | user_management.create | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 197 |
| components/admin/operating-structure/PeopleTab | Edit | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 220 |
| components/admin/operating-structure/PeopleTab | act(() => endPortfolio.mutateAsync( ), 'Responsibility ended')} > End | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 223 |
| components/admin/operating-structure/PeopleTab | Add unit membership | user_management.create | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 244 |
| components/admin/operating-structure/PeopleTab | openTeamDialog(m)}>Change role | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 257 |
| components/admin/operating-structure/PeopleTab | act(() => endMember.mutateAsync( ), 'Membership ended')} > End | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 258 |
| components/admin/operating-structure/PeopleTab | A sector Full sector responsibility, or selected areas of work within one sector | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 317 |
| components/admin/operating-structure/PeopleTab | Specific work Named sub-sectors or individual entities, across one or more areas | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 327 |
| components/admin/operating-structure/PeopleTab | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 384 |
| components/admin/operating-structure/PeopleTab | Save | user_management.edit | Yes | src/components/admin/operating-structure/PeopleTab.tsx | 385 |
| components/admin/operating-structure/RegulatorsAdminTab | Full regulator management | user_management.edit | Yes | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 72 |
| components/admin/operating-structure/RegulatorsAdminTab | setStatus(r, 'inactive')}> Deactivate | user_management.edit | Yes | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 91 |
| components/admin/operating-structure/RegulatorsAdminTab | setStatus(r, 'active')}> Activate | user_management.edit | Yes | src/components/admin/operating-structure/RegulatorsAdminTab.tsx | 95 |
| components/admin/operating-structure/ResponsibilityDialog | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/ResponsibilityDialog.tsx | 456 |
| components/admin/operating-structure/ResponsibilityDialog | Save | user_management.edit | Yes | src/components/admin/operating-structure/ResponsibilityDialog.tsx | 457 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 274 |
| components/admin/operating-structure/SectorAssignDialogs | Assign lead | user_management.edit | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 275 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | — | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 388 |
| components/admin/operating-structure/SectorAssignDialogs | Cancel | user_management.edit | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 504 |
| components/admin/operating-structure/SectorAssignDialogs | Save | user_management.edit | Yes | src/components/admin/operating-structure/SectorAssignDialogs.tsx | 505 |
| components/admin/operating-structure/SectorCoverageSheet | + Add supporting staff | user_management.create | Yes | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 78 |
| components/admin/operating-structure/SectorCoverageSheet | Edit | user_management.edit | Yes | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 93 |
| components/admin/operating-structure/SectorCoverageSheet | removePerson(p.areas.map((a) => a.portfolioId))} > Remove | user_management.edit | Yes | src/components/admin/operating-structure/SectorCoverageSheet.tsx | 100 |
| components/admin/operating-structure/SectorCoverageTab | Manage | user_management.edit | Yes | src/components/admin/operating-structure/SectorCoverageTab.tsx | 125 |
| components/admin/operating-structure/StaffResponsibilityTab | Edit responsibilities | user_management.edit | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 176 |
| components/admin/operating-structure/StaffResponsibilityTab | Add | user_management.create | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 246 |
| components/admin/operating-structure/StaffResponsibilityTab | act(() => endMember.mutateAsync( ), 'Membership ended')} > End | user_management.edit | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 264 |
| components/admin/operating-structure/StaffResponsibilityTab | Add responsibility | user_management.create | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 321 |
| components/admin/operating-structure/StaffResponsibilityTab | act(() => endPortfolio.mutateAsync( ), 'Responsibility ended')} > End | user_management.edit | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 339 |
| components/admin/operating-structure/StaffResponsibilityTab | Add | user_management.create | Yes | src/components/admin/operating-structure/StaffResponsibilityTab.tsx | 394 |
| components/admin/operating-structure/TeamAdminTab | New team | user_management.create | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 119 |
| components/admin/operating-structure/TeamAdminTab | Edit | user_management.edit | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 158 |
| components/admin/operating-structure/TeamAdminTab | Add / update | user_management.create | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 202 |
| components/admin/operating-structure/TeamAdminTab | act(() => endMember.mutateAsync( ), 'Membership ended')} > End | user_management.edit | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 243 |
| components/admin/operating-structure/TeamAdminTab | Attach | user_management.edit | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 278 |
| components/admin/operating-structure/TeamAdminTab | Detach | user_management.edit | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 296 |
| components/admin/operating-structure/TeamAdminTab | Cancel | — | Yes | src/components/admin/operating-structure/TeamAdminTab.tsx | 373 |
| components/admin/rdm/DataIntegrityPanel | Refresh | — | Yes | src/components/admin/rdm/DataIntegrityPanel.tsx | 171 |
| components/admin/rdm/MetadataTablePanel | Add | settings.edit | Yes | src/components/admin/rdm/MetadataTablePanel.tsx | 182 |
| components/admin/rdm/MetadataTablePanel | Cancel | settings.edit | Yes | src/components/admin/rdm/MetadataTablePanel.tsx | 305 |
| components/admin/rdm/MetadataTablePanel | Save | settings.edit | Yes | src/components/admin/rdm/MetadataTablePanel.tsx | 306 |
| components/admin/returns-config/DataIntegrityPanel | Re-verify | returns_management.edit | Yes | src/components/admin/returns-config/DataIntegrityPanel.tsx | 44 |
| components/admin/returns-config/DefinitionFormsDrawer | Assign form | returns_management.workflow_action | Yes | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 110 |
| components/admin/returns-config/DefinitionFormsDrawer | Cancel | returns_management.edit | Yes | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 150 |
| components/admin/returns-config/DefinitionFormsDrawer | Save | returns_management.edit | Yes | src/components/admin/returns-config/DefinitionFormsDrawer.tsx | 151 |
| components/admin/returns-config/ObligationRulesPanel | New obligation rule | returns_management.create | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 120 |
| components/admin/returns-config/ObligationRulesPanel | Test rule | — | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 151 |
| components/admin/returns-config/ObligationRulesPanel | Cancel | returns_management.edit | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 249 |
| components/admin/returns-config/ObligationRulesPanel | Save rule | returns_management.edit | Yes | src/components/admin/returns-config/ObligationRulesPanel.tsx | 250 |
| components/admin/returns-config/RegulatoryMetricsPanel | New metric | returns_management.create | Yes | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 100 |
| components/admin/returns-config/RegulatoryMetricsPanel | deactivate(m)}>Deactivate | returns_management.edit | Yes | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 130 |
| components/admin/returns-config/RegulatoryMetricsPanel | Cancel | returns_management.edit | Yes | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 242 |
| components/admin/returns-config/RegulatoryMetricsPanel | Save metric | returns_management.edit | Yes | src/components/admin/returns-config/RegulatoryMetricsPanel.tsx | 243 |
| components/admin/returns-config/ReturnDefinitionsPanel | New return definition | returns_management.create | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 103 |
| components/admin/returns-config/ReturnDefinitionsPanel | Cancel | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 223 |
| components/admin/returns-config/ReturnDefinitionsPanel | Save definition | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 224 |
| components/admin/returns-config/ReturnDefinitionsPanel | Edit | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 318 |
| components/admin/returns-config/ReturnDefinitionsPanel | Assigned forms ( ) | — | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 319 |
| components/admin/returns-config/ReturnDefinitionsPanel | Activate | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 321 |
| components/admin/returns-config/ReturnDefinitionsPanel | Suspend | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 324 |
| components/admin/returns-config/ReturnDefinitionsPanel | Retire… | returns_management.edit | Yes | src/components/admin/returns-config/ReturnDefinitionsPanel.tsx | 327 |
| components/admin/rule-engine/ModuleTesterPanel | Run test | rule_engine.test | Yes | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 118 |
| components/admin/rule-engine/ModuleTesterPanel | CSV | rule_engine.export | Yes | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 124 |
| components/admin/rule-engine/ModuleTesterPanel | JSON | rule_engine.export | Yes | src/components/admin/rule-engine/ModuleTesterPanel.tsx | 127 |
| components/admin/rule-engine/RuleTesterPanel | Run test | rule_engine.edit | Yes | src/components/admin/rule-engine/RuleTesterPanel.tsx | 171 |
| components/admin/rule-engine/RuleTesterPanel | Export CSV | rule_engine.export | Yes | src/components/admin/rule-engine/RuleTesterPanel.tsx | 176 |
| components/admin/rule-engine/RuleTesterPanel | Export JSON | rule_engine.export | Yes | src/components/admin/rule-engine/RuleTesterPanel.tsx | 179 |
| components/ai-reports/EntityCoverageView | Try again | — | Yes | src/components/ai-reports/EntityCoverageView.tsx | 60 |
| components/ai-reports/EntityCoverageView | View report | — | Yes | src/components/ai-reports/EntityCoverageView.tsx | 137 |
| components/ai/AiReportDetailDrawer | Try again | — | Yes | src/components/ai/AiReportDetailDrawer.tsx | 239 |
| components/ai/AiReportDetailDrawer | Try again | — | Yes | src/components/ai/AiReportDetailDrawer.tsx | 355 |
| components/ai/SupervisoryAiPanel | Copy | — | Yes | src/components/ai/SupervisoryAiPanel.tsx | 267 |
| components/appeals/AppealActionsDialog | Acknowledge appeal | license_appeals.edit | Yes | src/components/appeals/AppealActionsDialog.tsx | 180 |
| components/appeals/AppealActionsDialog | Consider appeal | license_appeals.edit | Yes | src/components/appeals/AppealActionsDialog.tsx | 245 |
| components/appeals/AppealActionsDialog | decide('dismissed')} disabled= > Decline appeal | license_appeals.decide | Yes | src/components/appeals/AppealActionsDialog.tsx | 255 |
| components/appeals/AppealActionsDialog | Reopen application | license_appeals.edit | Yes | src/components/appeals/AppealActionsDialog.tsx | 283 |
| components/appeals/AppealActionsDialog | Close | — | Yes | src/components/appeals/AppealActionsDialog.tsx | 303 |
| components/appeals/AppealPanelMembersDialog | Add member | license_appeals.create | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 182 |
| components/appeals/AppealPanelMembersDialog | makeChair(m)} disabled= > Make chair | license_appeals.edit | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 207 |
| components/appeals/AppealPanelMembersDialog | Save member | license_appeals.edit | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 301 |
| components/appeals/AppealPanelMembersDialog | Cancel | — | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 305 |
| components/appeals/AppealPanelMembersDialog | Close | — | Yes | src/components/appeals/AppealPanelMembersDialog.tsx | 312 |
| components/appeals/AppealPanelSection | Refer &amp; constitute panel | license_appeals.edit | Yes | src/components/appeals/AppealPanelSection.tsx | 253 |
| components/appeals/AppealPanelSection | Amend minutes | license_appeals.edit | Yes | src/components/appeals/AppealPanelSection.tsx | 355 |
| components/appeals/AppealPanelSection | Cancel | — | Yes | src/components/appeals/AppealPanelSection.tsx | 385 |
| components/appeals/AppealParticipationPanel | Record participation | license_appeals.edit | Yes | src/components/appeals/AppealParticipationPanel.tsx | 140 |
| components/appeals/AppealParticipationPanel | Declare conflict &amp; recuse | license_appeals.edit | Yes | src/components/appeals/AppealParticipationPanel.tsx | 147 |
| components/appeals/AppealParticipationPanel | Cast vote | license_appeals.edit | Yes | src/components/appeals/AppealParticipationPanel.tsx | 179 |
| components/appeals/InternalUserMultiSelect | {selected.length === 0 ? placeholder : `$ selected`} | — | Yes | src/components/appeals/InternalUserMultiSelect.tsx | 47 |
| components/appeals/LicenseAppealPanel | Withdraw appeal | license_appeals.edit | Yes | src/components/appeals/LicenseAppealPanel.tsx | 130 |
| components/appeals/LicenseAppealPanel | Lodge an appeal | — | Yes | src/components/appeals/LicenseAppealPanel.tsx | 151 |
| components/appeals/LodgeAppealDialog | Cancel | license_appeals.edit | Yes | src/components/appeals/LodgeAppealDialog.tsx | 91 |
| components/appeals/LodgeAppealDialog | Submit appeal | license_appeals.edit | Yes | src/components/appeals/LodgeAppealDialog.tsx | 92 |
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
| components/applications/ApplicationWithdrawalPanel | Withdraw Application | application_management.edit | Yes | src/components/applications/ApplicationWithdrawalPanel.tsx | 189 |
| components/applications/ConfigurableDecisionActions | Cancel | — | Yes | src/components/applications/ConfigurableDecisionActions.tsx | 273 |
| components/applications/ConfigurableDecisionActions | Confirm | — | Yes | src/components/applications/ConfigurableDecisionActions.tsx | 276 |
| components/applications/DecisionDocumentPreview | Print | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 496 |
| components/applications/DecisionDocumentPreview | Download | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 497 |
| components/applications/DecisionDocumentPreview | Copy text | — | Yes | src/components/applications/DecisionDocumentPreview.tsx | 499 |
| components/applications/DecisionDocumentPreview | Print certificate | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 567 |
| components/applications/DecisionDocumentPreview | Download PDF | application_management.view | Yes | src/components/applications/DecisionDocumentPreview.tsx | 571 |
| components/applications/DecisionDocumentPreview | Record decision letter | application_management.approve | Yes | src/components/applications/DecisionDocumentPreview.tsx | 613 |
| components/applications/DecisionDocumentPreview | Record certificate | application_management.approve | Yes | src/components/applications/DecisionDocumentPreview.tsx | 619 |
| components/applications/FeeComponentsPanel | Add Fee | fee_management.edit | Yes | src/components/applications/FeeComponentsPanel.tsx | 204 |
| components/applications/FeeComponentsPanel | Cancel | — | Yes | src/components/applications/FeeComponentsPanel.tsx | 249 |
| components/applications/LegalComplianceNotesSection | Save Legal Note | application_management.edit | Yes | src/components/applications/LegalComplianceNotesSection.tsx | 208 |
| components/applications/LegalReferralPanel | setOpen(true)}> Refer for review | application_management.workflow_action | Yes | src/components/applications/LegalReferralPanel.tsx | 166 |
| components/applications/LegalReferralPanel | transition(r, 'in_review')}> Accept review | application_management.approve | Yes | src/components/applications/LegalReferralPanel.tsx | 221 |
| components/applications/LegalReferralPanel | Return opinion to case | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 226 |
| components/applications/LegalReferralPanel | setCompleting(r)}> Close referral | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 231 |
| components/applications/LegalReferralPanel | Cancel | — | Yes | src/components/applications/LegalReferralPanel.tsx | 236 |
| components/applications/LegalReferralPanel | Cancel | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 287 |
| components/applications/LegalReferralPanel | Raise referral | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 288 |
| components/applications/LegalReferralPanel | Cancel | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 309 |
| components/applications/LegalReferralPanel | completing && transition(completing, 'completed', completionNotes.trim() \|\| null | application_management.edit | Yes | src/components/applications/LegalReferralPanel.tsx | 310 |
| components/applications/LicenseConditionsPanel | Add condition | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 120 |
| components/applications/LicenseConditionsPanel | Cancel | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 160 |
| components/applications/LicenseConditionsPanel | Add | application_management.edit | Yes | src/components/applications/LicenseConditionsPanel.tsx | 161 |
| components/applications/LicenseePaymentPanel | Download invoice | — | Yes | src/components/applications/LicenseePaymentPanel.tsx | 324 |
| components/applications/LicenseePaymentPanel | Paid Offline | application_management.edit | Yes | src/components/applications/LicenseePaymentPanel.tsx | 407 |
| components/applications/PaymentVerificationDialog | Download invoice | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 371 |
| components/applications/PaymentVerificationDialog | Reject payment | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 380 |
| components/applications/PaymentVerificationDialog | Verify & issue invoice | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 384 |
| components/applications/PaymentVerificationDialog | Cancel | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 391 |
| components/applications/PaymentVerificationDialog | Received & Verify | application_management.edit | Yes | src/components/applications/PaymentVerificationDialog.tsx | 395 |
| components/applications/PaymentVerificationDialog | Close | — | Yes | src/components/applications/PaymentVerificationDialog.tsx | 401 |
| components/applications/RaiseRfiDialog | Add all | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 305 |
| components/applications/RaiseRfiDialog | Add item | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 351 |
| components/applications/RaiseRfiDialog | Cancel | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 417 |
| components/applications/RaiseRfiDialog | Raise RFI | application_management.edit | Yes | src/components/applications/RaiseRfiDialog.tsx | 420 |
| components/applications/SubmissionAcknowledgement | Track Application | application_management.view | Yes | src/components/applications/SubmissionAcknowledgement.tsx | 102 |
| components/applications/SubmissionAcknowledgement | Download | application_management.view | Yes | src/components/applications/SubmissionAcknowledgement.tsx | 109 |
| components/applications/SubmissionAcknowledgementPanel | View / Download | — | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 140 |
| components/applications/SubmissionAcknowledgementPanel | View / Download Submission Acknowledgement | — | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 190 |
| components/applications/SubmissionAcknowledgementPanel | Check again | application_management.edit | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 199 |
| components/applications/SubmissionAcknowledgementPanel | Generate acknowledgement | application_management.edit | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 226 |
| components/applications/SubmissionAcknowledgementPanel | Download acknowledgement (PDF) | application_management.edit | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 289 |
| components/applications/SubmissionAcknowledgementPanel | Regenerate document | application_management.edit | Yes | src/components/applications/SubmissionAcknowledgementPanel.tsx | 299 |
| components/applications/SufficiencyPanel | Request missing information ( ) | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 302 |
| components/applications/SufficiencyPanel | Try again | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 341 |
| components/applications/SufficiencyPanel | Run automated checks | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 349 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 363 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 395 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 410 |
| components/applications/SufficiencyPanel | Request information | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 453 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 463 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 468 |
| components/applications/SufficiencyPanel | View reason | — | Yes | src/components/applications/SufficiencyPanel.tsx | 478 |
| components/applications/SufficiencyPanel | Record sufficiency decision | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 524 |
| components/applications/SufficiencyPanel | Try again | — | Yes | src/components/applications/SufficiencyPanel.tsx | 547 |
| components/applications/SufficiencyPanel | Previous determinations ( ) — history | application_management.edit | Yes | src/components/applications/SufficiencyPanel.tsx | 578 |
| components/applications/SufficiencyPanel | Cancel | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 635 |
| components/applications/SufficiencyPanel | Accept exception | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 636 |
| components/applications/SufficiencyPanel | Close | — | Yes | src/components/applications/SufficiencyPanel.tsx | 657 |
| components/applications/SufficiencyPanel | Cancel | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 729 |
| components/applications/SufficiencyPanel | Record decision | application_management.approve | Yes | src/components/applications/SufficiencyPanel.tsx | 730 |
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
| components/audit/LineageViewer | Trace lineage | audit_management.export | Yes | src/components/audit/LineageViewer.tsx | 92 |
| components/audit/LineageViewer | Load lineage | audit_management.export | Yes | src/components/audit/LineageViewer.tsx | 100 |
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
| components/complaints/ClosureQaPanel | Go to Current step | — | Yes | src/components/complaints/ClosureQaPanel.tsx | 315 |
| components/complaints/ClosureQaPanel | setLetterOpen(true)}> Issue outcome letter | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 388 |
| components/complaints/ClosureQaPanel | Retry | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 399 |
| components/complaints/ClosureQaPanel | Retry | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 406 |
| components/complaints/ClosureQaPanel | Review Current step | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 425 |
| components/complaints/ClosureQaPanel | Cancel | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 512 |
| components/complaints/ClosureQaPanel | issueLetterMut.mutate()} disabled= > Issue letter | complaint_management.edit | Yes | src/components/complaints/ClosureQaPanel.tsx | 515 |
| components/complaints/ComplaintAcknowledgement | Close | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 224 |
| components/complaints/ComplaintAcknowledgement | Print / Save as PDF | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 227 |
| components/complaints/ComplaintAcknowledgement | Close | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 308 |
| components/complaints/ComplaintAcknowledgement | Print / Save as PDF | complaint_management.view | Yes | src/components/complaints/ComplaintAcknowledgement.tsx | 311 |
| components/complaints/ComplaintCurrentStepPanel | Open | — | Yes | src/components/complaints/ComplaintCurrentStepPanel.tsx | 215 |
| components/complaints/ComplaintEntityCard | Change linked entity | complaint_management.edit | Yes | src/components/complaints/ComplaintEntityCard.tsx | 242 |
| components/complaints/ComplaintEntityCard | Link a licensed entity instead | complaint_management.edit | Yes | src/components/complaints/ComplaintEntityCard.tsx | 269 |
| components/complaints/ComplaintEvidenceRow | Reprint acknowledgement | complaint_management.edit | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 71 |
| components/complaints/ComplaintEvidenceRow | Retry auto-triage | complaint_management.edit | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 72 |
| components/complaints/ComplaintEvidenceRow | Open full detail & history | — | Yes | src/components/complaints/ComplaintEvidenceRow.tsx | 73 |
| components/complaints/ComplaintInvestigationTab | Open jurisdiction | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 138 |
| components/complaints/ComplaintInvestigationTab | Open triage | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 139 |
| components/complaints/ComplaintInvestigationTab | Open the investigation | complaint_management.investigate | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 157 |
| components/complaints/ComplaintInvestigationTab | Add note | complaint_management.edit | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 208 |
| components/complaints/ComplaintInvestigationTab | Correspondence on this case ( ) | complaint_management.edit | Yes | src/components/complaints/ComplaintInvestigationTab.tsx | 251 |
| components/complaints/ComplaintOverviewSummary | Go to current step | — | Yes | src/components/complaints/ComplaintOverviewSummary.tsx | 132 |
| components/complaints/ComplaintPhasePanel | Open jurisdiction assessment | — | Yes | src/components/complaints/ComplaintPhasePanel.tsx | 69 |
| components/complaints/ComplaintPhasePanel | Go there | complaint_management.edit | Yes | src/components/complaints/ComplaintPhasePanel.tsx | 121 |
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
| components/complaints/investigation/InvestigationPlanPanel | Jurisdiction | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 104 |
| components/complaints/investigation/InvestigationPlanPanel | Triage | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 107 |
| components/complaints/investigation/InvestigationPlanPanel | Open the investigation | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 113 |
| components/complaints/investigation/InvestigationPlanPanel | Save plan | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 185 |
| components/complaints/investigation/InvestigationPlanPanel | Submit for approval | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 195 |
| components/complaints/investigation/InvestigationPlanPanel | Approve plan | complaint_management.approve | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 206 |
| components/complaints/investigation/InvestigationPlanPanel | Create a revision | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationPlanPanel.tsx | 228 |
| components/complaints/investigation/InvestigationReadinessPanel | Open information requests | — | Yes | src/components/complaints/investigation/InvestigationReadinessPanel.tsx | 75 |
| components/complaints/investigation/InvestigationReadinessPanel | Go to closure &amp; QA | — | Yes | src/components/complaints/investigation/InvestigationReadinessPanel.tsx | 80 |
| components/complaints/investigation/InvestigationRfiLinkPanel | Open information requests | — | Yes | src/components/complaints/investigation/InvestigationRfiLinkPanel.tsx | 44 |
| components/complaints/investigation/InvestigationTasksPanel | Add work item | complaint_management.investigate | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 129 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as being worked on | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 198 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as done | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 207 |
| components/complaints/investigation/InvestigationTasksPanel | Mark as blocked | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 226 |
| components/complaints/investigation/InvestigationTasksPanel | No longer required | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 245 |
| components/complaints/investigation/InvestigationTasksPanel | Reopen | complaint_management.edit | Yes | src/components/complaints/investigation/InvestigationTasksPanel.tsx | 254 |
| components/complaints/investigation/RepresentationsPanel | Open the window | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 121 |
| components/complaints/investigation/RepresentationsPanel | Mark under review | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 181 |
| components/complaints/investigation/RepresentationsPanel | Accept for consideration | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 189 |
| components/complaints/investigation/RepresentationsPanel | Extend deadline | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 211 |
| components/complaints/investigation/RepresentationsPanel | Close window | complaint_management.investigate | Yes | src/components/complaints/investigation/RepresentationsPanel.tsx | 263 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Start assessment | complaint_management.assess_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 337 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Save | complaint_management.assess_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 429 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record information request | complaint_management.assess_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 492 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record decision | complaint_management.decide_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 617 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Reopen assessment | complaint_management.decide_jurisdiction | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 687 |
| components/complaints/jurisdiction/JurisdictionWorkspace | Record response | complaint_management.edit | Yes | src/components/complaints/jurisdiction/JurisdictionWorkspace.tsx | 719 |
| components/complaints/LicenseePicker | Retry | — | Yes | src/components/complaints/LicenseePicker.tsx | 211 |
| components/complaints/outcome/ClosureGatePanel | Go to outcome | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 115 |
| components/complaints/outcome/ClosureGatePanel | Go to redress | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 116 |
| components/complaints/outcome/ClosureGatePanel | setMode('letter')}>Issue outcome letter | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 117 |
| components/complaints/outcome/ClosureGatePanel | Re-check | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 118 |
| components/complaints/outcome/ClosureGatePanel | Send for quality review | complaint_management.view | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 160 |
| components/complaints/outcome/ClosureGatePanel | Pass review | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 163 |
| components/complaints/outcome/ClosureGatePanel | Return for correction | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 166 |
| components/complaints/outcome/ClosureGatePanel | }> Approve and close | complaint_management.edit | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 189 |
| components/complaints/outcome/ClosureGatePanel | Cancel | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 258 |
| components/complaints/outcome/ClosureGatePanel | Confirm | — | Yes | src/components/complaints/outcome/ClosureGatePanel.tsx | 259 |
| components/complaints/outcome/OutcomeReviewPanel | Go to redress | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 211 |
| components/complaints/outcome/OutcomeReviewPanel | Go to closure &amp; quality review | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 212 |
| components/complaints/outcome/OutcomeReviewPanel | Open redress | — | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 269 |
| components/complaints/outcome/OutcomeReviewPanel | Save draft | complaint_management.edit | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 308 |
| components/complaints/outcome/OutcomeReviewPanel | Complete outcome review | complaint_management.edit | Yes | src/components/complaints/outcome/OutcomeReviewPanel.tsx | 312 |
| components/complaints/outcome/ReconsiderationPanel | Record a request | complaint_management.edit | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 116 |
| components/complaints/outcome/ReconsiderationPanel | { setRationale(''); setChoice('ADMISSIBLE'); setAction( ); }}> Decide admissibil | complaint_management.edit | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 170 |
| components/complaints/outcome/ReconsiderationPanel | Record review decision | complaint_management.edit | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 182 |
| components/complaints/outcome/ReconsiderationPanel | Cancel | complaint_management.edit | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 234 |
| components/complaints/outcome/ReconsiderationPanel | Record request | complaint_management.edit | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 235 |
| components/complaints/outcome/ReconsiderationPanel | Cancel | — | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 304 |
| components/complaints/outcome/ReconsiderationPanel | Confirm | — | Yes | src/components/complaints/outcome/ReconsiderationPanel.tsx | 305 |
| components/complaints/outcome/RedressPanel | Add redress | complaint_management.create | Yes | src/components/complaints/outcome/RedressPanel.tsx | 139 |
| components/complaints/outcome/RedressPanel | Edit | complaint_management.edit | Yes | src/components/complaints/outcome/RedressPanel.tsx | 187 |
| components/complaints/outcome/RedressPanel | Mark completed | complaint_management.edit | Yes | src/components/complaints/outcome/RedressPanel.tsx | 204 |
| components/complaints/outcome/RedressPanel | Verify | complaint_management.edit | Yes | src/components/complaints/outcome/RedressPanel.tsx | 208 |
| components/complaints/outcome/RedressPanel | Cancel | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 212 |
| components/complaints/outcome/RedressPanel | Cancel | complaint_management.edit | Yes | src/components/complaints/outcome/RedressPanel.tsx | 300 |
| components/complaints/outcome/RedressPanel | Save | complaint_management.edit | Yes | src/components/complaints/outcome/RedressPanel.tsx | 301 |
| components/complaints/outcome/RedressPanel | Close | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 328 |
| components/complaints/outcome/RedressPanel | Confirm | — | Yes | src/components/complaints/outcome/RedressPanel.tsx | 329 |
| components/complaints/public-intake/PublicComplaintWizard | Track this complaint | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 297 |
| components/complaints/public-intake/PublicComplaintWizard | Back to home | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 304 |
| components/complaints/public-intake/PublicComplaintWizard | Back | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 388 |
| components/complaints/public-intake/PublicComplaintWizard | Continue | — | Yes | src/components/complaints/public-intake/PublicComplaintWizard.tsx | 397 |
| components/complaints/public-intake/StepsNarrative | Edit | complaint_management.edit | Yes | src/components/complaints/public-intake/StepsNarrative.tsx | 559 |
| components/complaints/public-intake/StepsSubject | Remove | complaint_management.edit | Yes | src/components/complaints/public-intake/StepsSubject.tsx | 73 |
| components/complaints/public-intake/StepsSubject | Change | complaint_management.edit | Yes | src/components/complaints/public-intake/StepsSubject.tsx | 121 |
| components/complaints/public-intake/StepsSubject | More than one business or person is involved | complaint_management.edit | Yes | src/components/complaints/public-intake/StepsSubject.tsx | 327 |
| components/complaints/QueryErrorState | Retry | — | Yes | src/components/complaints/QueryErrorState.tsx | 41 |
| components/complaints/QueryErrorState | Retry | — | Yes | src/components/complaints/QueryErrorState.tsx | 59 |
| components/complaints/RaiseComplaintRfiDialog | Add question | complaint_management.create | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 200 |
| components/complaints/RaiseComplaintRfiDialog | Cancel | complaint_management.edit | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 252 |
| components/complaints/RaiseComplaintRfiDialog | Save draft | complaint_management.edit | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 255 |
| components/complaints/RaiseComplaintRfiDialog | Submit for approval | complaint_management.submit | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 258 |
| components/complaints/RaiseComplaintRfiDialog | submit('dispatch')} disabled= > Issue request | complaint_management.edit | Yes | src/components/complaints/RaiseComplaintRfiDialog.tsx | 263 |
| components/complaints/ReviewRfiDialog | Add question | complaint_management.create | Yes | src/components/complaints/ReviewRfiDialog.tsx | 233 |
| components/complaints/ReviewRfiDialog | Close | complaint_management.edit | Yes | src/components/complaints/ReviewRfiDialog.tsx | 322 |
| components/complaints/ReviewRfiDialog | Save changes | complaint_management.edit | Yes | src/components/complaints/ReviewRfiDialog.tsx | 324 |
| components/complaints/ReviewRfiDialog | Submit for approval | complaint_management.edit | Yes | src/components/complaints/ReviewRfiDialog.tsx | 329 |
| components/complaints/ReviewRfiDialog | Reject | complaint_management.approve_rfi | Yes | src/components/complaints/ReviewRfiDialog.tsx | 336 |
| components/complaints/ReviewRfiDialog | Approve &amp; dispatch | complaint_management.approve_rfi | Yes | src/components/complaints/ReviewRfiDialog.tsx | 344 |
| components/complaints/RfiAttachmentList | onRemove(f.id)}> Remove | complaint_management.edit | Yes | src/components/complaints/RfiAttachmentList.tsx | 45 |
| components/complaints/triage/TriagePanel | Open jurisdiction assessment | complaint_management.retry_triage | Yes | src/components/complaints/triage/TriagePanel.tsx | 179 |
| components/complaints/triage/TriagePanel | Re-run | complaint_management.retry_triage | Yes | src/components/complaints/triage/TriagePanel.tsx | 192 |
| components/complaints/TriageHistoryCard | Close | — | Yes | src/components/complaints/TriageHistoryCard.tsx | 145 |
| components/complaints/VulnerabilityReviewBanner | Complete review | complaint_management.edit | Yes | src/components/complaints/VulnerabilityReviewBanner.tsx | 107 |
| components/complaints/VulnerabilityReviewBanner | Cancel | — | Yes | src/components/complaints/VulnerabilityReviewBanner.tsx | 174 |
| components/complaints/WorkflowActionPanel | Cancel | complaint_management.edit | Yes | src/components/complaints/WorkflowActionPanel.tsx | 230 |
| components/complaints/WorkflowActionPanel | Confirm: | complaint_management.edit | Yes | src/components/complaints/WorkflowActionPanel.tsx | 233 |
| components/conduct/analytics/ConductDrillthroughPanel | Apply to filters | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 101 |
| components/conduct/analytics/ConductDrillthroughPanel | View in complaints list | — | Yes | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 102 |
| components/conduct/analytics/ConductDrillthroughPanel | Clear | — | Yes | src/components/conduct/analytics/ConductDrillthroughPanel.tsx | 103 |
| components/conduct/analytics/SavedViewsBar | No saved views yet | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 49 |
| components/conduct/analytics/SavedViewsBar | Save current | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 60 |
| components/conduct/analytics/SavedViewsBar | Update “ ” | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 66 |
| components/conduct/analytics/SavedViewsBar | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 107 |
| components/conduct/analytics/SavedViewsBar | Save view | market_conduct.manage_complaints | Yes | src/components/conduct/analytics/SavedViewsBar.tsx | 108 |
| components/conduct/ClosurePanel | Print / PDF | market_conduct.run_conduct_analytics | Yes | src/components/conduct/ClosurePanel.tsx | 251 |
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
| components/conduct/intelligence/PlanningAdvisoryPanel | Use as a starting point | market_conduct.manage_complaints | Yes | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 149 |
| components/conduct/intelligence/PlanningAdvisoryPanel | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 470 |
| components/conduct/intelligence/PlanningAdvisoryPanel | Record decision | market_conduct.manage_complaints | Yes | src/components/conduct/intelligence/PlanningAdvisoryPanel.tsx | 471 |
| components/conduct/InterviewRecordDialog | Cancel interview | market_conduct.manage_complaints | Yes | src/components/conduct/InterviewRecordDialog.tsx | 250 |
| components/conduct/InterviewRecordDialog | Close | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 254 |
| components/conduct/InterviewRecordDialog | Add | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 329 |
| components/conduct/InterviewRecordDialog | Select file | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 466 |
| components/conduct/InterviewRecordDialog | Upload document | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 471 |
| components/conduct/InterviewRecordDialog | Finalise record | market_conduct.edit | Yes | src/components/conduct/InterviewRecordDialog.tsx | 563 |
| components/conduct/InterviewsPanel | Add interview | market_conduct.edit | Yes | src/components/conduct/InterviewsPanel.tsx | 57 |
| components/conduct/InterviewsPanel | Open | — | Yes | src/components/conduct/InterviewsPanel.tsx | 105 |
| components/conduct/InvestigationCaseFilePanel | Save case file | market_conduct.edit | Yes | src/components/conduct/InvestigationCaseFilePanel.tsx | 74 |
| components/conduct/IssueActionDialog | Cancel | market_conduct.issue_enforcement_action | Yes | src/components/conduct/IssueActionDialog.tsx | 149 |
| components/conduct/IssueActionDialog | Issue action | market_conduct.issue_enforcement_action | Yes | src/components/conduct/IssueActionDialog.tsx | 150 |
| components/conduct/planning/EntityPlanningLinksCard | Open | — | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 80 |
| components/conduct/planning/EntityPlanningLinksCard | Open | — | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 114 |
| components/conduct/planning/EntityPlanningLinksCard | Open | market_conduct.manage_complaints | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 156 |
| components/conduct/planning/EntityPlanningLinksCard | — | market_conduct.manage_complaints | Yes | src/components/conduct/planning/EntityPlanningLinksCard.tsx | 174 |
| components/conduct/planning/RaiseAttentionFromRisk | Open | market_conduct.manage_complaints | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 110 |
| components/conduct/planning/RaiseAttentionFromRisk | Raise for supervisory attention | market_conduct.manage_complaints | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 120 |
| components/conduct/planning/RaiseAttentionFromRisk | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 178 |
| components/conduct/planning/RaiseAttentionFromRisk | Raise for attention | market_conduct.manage_complaints | Yes | src/components/conduct/planning/RaiseAttentionFromRisk.tsx | 179 |
| components/conduct/PostClosureMonitoringPanel | Record | market_conduct.edit | Yes | src/components/conduct/PostClosureMonitoringPanel.tsx | 64 |
| components/conduct/PostClosureMonitoringPanel | Save directive | market_conduct.edit | Yes | src/components/conduct/PostClosureMonitoringPanel.tsx | 194 |
| components/conduct/reporting/NarrativeAdoptionDialog | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/reporting/NarrativeAdoptionDialog.tsx | 123 |
| components/conduct/reporting/NarrativeAdoptionDialog | Adopt into report | market_conduct.manage_complaints | Yes | src/components/conduct/reporting/NarrativeAdoptionDialog.tsx | 124 |
| components/conduct/reporting/ReportingAdvisoryPanel | Adopt into a report section | market_conduct.manage_complaints | Yes | src/components/conduct/reporting/ReportingAdvisoryPanel.tsx | 254 |
| components/conduct/supervision-loop/EntityConductTimeline | Annotate | market_conduct.manage_complaints | Yes | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 91 |
| components/conduct/supervision-loop/EntityConductTimeline | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 115 |
| components/conduct/supervision-loop/EntityConductTimeline | Save | market_conduct.manage_complaints | Yes | src/components/conduct/supervision-loop/EntityConductTimeline.tsx | 116 |
| components/conduct/supervision-loop/UnresolvedRisksPanel | Action Required | — | Yes | src/components/conduct/supervision-loop/UnresolvedRisksPanel.tsx | 49 |
| components/conduct/surveillance/SignalDetailDrawer | Record disposition | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 178 |
| components/conduct/surveillance/SignalDetailDrawer | Refer to investigation | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 245 |
| components/conduct/surveillance/SignalDetailDrawer | Add evidence record | market_conduct.edit | Yes | src/components/conduct/surveillance/SignalDetailDrawer.tsx | 279 |
| components/conduct/three-sixty/advisory/AdvisoryCard | Check freshness | — | Yes | src/components/conduct/three-sixty/advisory/AdvisoryCard.tsx | 232 |
| components/conduct/three-sixty/advisory/AdvisoryCard | Decision history ( ) | — | Yes | src/components/conduct/three-sixty/advisory/AdvisoryCard.tsx | 245 |
| components/conduct/three-sixty/advisory/AdvisoryProvenance | Technical provenance | — | Yes | src/components/conduct/three-sixty/advisory/AdvisoryProvenance.tsx | 48 |
| components/conduct/three-sixty/advisory/AdvisoryReviewDialog | Cancel | market_conduct.manage_complaints | Yes | src/components/conduct/three-sixty/advisory/AdvisoryReviewDialog.tsx | 126 |
| components/conduct/three-sixty/advisory/AdvisoryReviewDialog | Record decision | market_conduct.manage_complaints | Yes | src/components/conduct/three-sixty/advisory/AdvisoryReviewDialog.tsx | 127 |
| components/coordination/EscalationsTab | Raise Escalation | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 137 |
| components/coordination/EscalationsTab | Cancel | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 174 |
| components/coordination/EscalationsTab | Raise | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 175 |
| components/coordination/EscalationsTab | Mark under review | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 224 |
| components/coordination/EscalationsTab | Reassign | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 229 |
| components/coordination/EscalationsTab | Resolve | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 232 |
| components/coordination/EscalationsTab | Withdraw | coordination.update | Yes | src/components/coordination/EscalationsTab.tsx | 235 |
| components/coordination/EscalationsTab | Cancel | — | Yes | src/components/coordination/EscalationsTab.tsx | 292 |
| components/coordination/EscalationsTab | Confirm | — | Yes | src/components/coordination/EscalationsTab.tsx | 293 |
| components/correspondence/AssignmentPanel | Save assignment | settings.edit | Yes | src/components/correspondence/AssignmentPanel.tsx | 65 |
| components/correspondence/CaseThreadsPanel | Open manager | — | Yes | src/components/correspondence/CaseThreadsPanel.tsx | 83 |
| components/correspondence/CaseThreadsPanel | Back to list | — | Yes | src/components/correspondence/CaseThreadsPanel.tsx | 117 |
| components/correspondence/ClassificationPanel | Save classification | settings.edit | Yes | src/components/correspondence/ClassificationPanel.tsx | 75 |
| components/correspondence/IntakeForm | Cancel | correspondence_management.approve | Yes | src/components/correspondence/IntakeForm.tsx | 266 |
| components/correspondence/IntakeForm | Capture &amp; auto-route | correspondence_management.approve | Yes | src/components/correspondence/IntakeForm.tsx | 267 |
| components/correspondence/MessageThreadPanel | Edit | notification_management.dispatch | Yes | src/components/correspondence/MessageThreadPanel.tsx | 217 |
| components/correspondence/MessageThreadPanel | Save draft | notification_management.dispatch | Yes | src/components/correspondence/MessageThreadPanel.tsx | 297 |
| components/correspondence/MessageThreadPanel | Send | notification_management.view | Yes | src/components/correspondence/MessageThreadPanel.tsx | 298 |
| components/correspondence/ResponseComposer | Preview | correspondence_management.approve | Yes | src/components/correspondence/ResponseComposer.tsx | 131 |
| components/correspondence/ResponseComposer | Send response | correspondence_management.approve | Yes | src/components/correspondence/ResponseComposer.tsx | 142 |
| components/correspondence/ReviewApprovalPanel | Start review | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 45 |
| components/correspondence/ReviewApprovalPanel | Approve response | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 48 |
| components/correspondence/ReviewApprovalPanel | Send back for revision | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 51 |
| components/correspondence/ReviewApprovalPanel | Close correspondence | correspondence_management.approve | Yes | src/components/correspondence/ReviewApprovalPanel.tsx | 54 |
| components/correspondence/SendCorrespondenceDialog | Send correspondence | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 123 |
| components/correspondence/SendCorrespondenceDialog | Cancel | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 188 |
| components/correspondence/SendCorrespondenceDialog | Send | correspondence_management.approve | Yes | src/components/correspondence/SendCorrespondenceDialog.tsx | 189 |
| components/correspondence/ThreadDetail | Await response | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 145 |
| components/correspondence/ThreadDetail | setReopenOpen(true)}> Reopen | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 151 |
| components/correspondence/ThreadDetail | setCloseOpen(true)}> Close thread | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 157 |
| components/correspondence/ThreadDetail | Add colleague | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 201 |
| components/correspondence/ThreadDetail | Cancel | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 258 |
| components/correspondence/ThreadDetail | Close thread | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 259 |
| components/correspondence/ThreadDetail | Cancel | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 272 |
| components/correspondence/ThreadDetail | Reopen thread | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 273 |
| components/correspondence/ThreadDetail | Cancel | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 291 |
| components/correspondence/ThreadDetail | Add colleague | notification_management.dispatch | Yes | src/components/correspondence/ThreadDetail.tsx | 292 |
| components/correspondence/ThreadList | Clear | — | Yes | src/components/correspondence/ThreadList.tsx | 138 |
| components/dashboard/applicant/ActionRequiredList | Continue | — | Yes | src/components/dashboard/applicant/ActionRequiredList.tsx | 84 |
| components/dashboard/applicant/RequiredFormsList | New | application_management.edit | Yes | src/components/dashboard/applicant/RequiredFormsList.tsx | 67 |
| components/dashboard/ApplicantDashboard | New application | application_management.create | Yes | src/components/dashboard/ApplicantDashboard.tsx | 125 |
| components/dashboard/ApplicationCard | View Details | application_management.edit | Yes | src/components/dashboard/ApplicationCard.tsx | 72 |
| components/dashboard/ApplicationCard | Review | application_management.edit | Yes | src/components/dashboard/ApplicationCard.tsx | 77 |
| components/dashboard/cards/LicenseStatusList | Continue Renewal | license_management.edit | Yes | src/components/dashboard/cards/LicenseStatusList.tsx | 162 |
| components/dashboard/cards/LicenseStatusList | Renew | license_management.edit | Yes | src/components/dashboard/cards/LicenseStatusList.tsx | 168 |
| components/dashboard/executive/ExecutiveAiWorkspace | Save and accept with changes | ai_management.approve | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 494 |
| components/dashboard/executive/ExecutiveAiWorkspace | Cancel | ai_management.approve | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 502 |
| components/dashboard/executive/ExecutiveAiWorkspace | Accept | ai_management.approve | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 509 |
| components/dashboard/executive/ExecutiveAiWorkspace | Modify and accept | ai_management.approve | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 518 |
| components/dashboard/executive/ExecutiveAiWorkspace | Reject | ai_management.approve | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 530 |
| components/dashboard/executive/ExecutiveAiWorkspace | Helpful | report_management.view | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 554 |
| components/dashboard/executive/ExecutiveAiWorkspace | Not helpful | report_management.view | Yes | src/components/dashboard/executive/ExecutiveAiWorkspace.tsx | 557 |
| components/dashboard/ExecutiveSupervisoryDashboard | AI Insights Hub | report_management.view | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 376 |
| components/dashboard/ExecutiveSupervisoryDashboard | Exit presentation mode | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 405 |
| components/dashboard/ExecutiveSupervisoryDashboard | Previous section | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 421 |
| components/dashboard/ExecutiveSupervisoryDashboard | Next section | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 427 |
| components/dashboard/ExecutiveSupervisoryDashboard | Refresh | report_management.export | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 477 |
| components/dashboard/ExecutiveSupervisoryDashboard | Presentation mode | report_management.export | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 480 |
| components/dashboard/ExecutiveSupervisoryDashboard | Export briefing | report_management.export | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 486 |
| components/dashboard/ExecutiveSupervisoryDashboard | Facts only | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 492 |
| components/dashboard/ExecutiveSupervisoryDashboard | Draft AI-assisted briefing | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 493 |
| components/dashboard/ExecutiveSupervisoryDashboard | Approved executive pack | — | Yes | src/components/dashboard/ExecutiveSupervisoryDashboard.tsx | 494 |
| components/dashboard/LicenseeDashboard | Continue Renewal | license_management.edit | Yes | src/components/dashboard/LicenseeDashboard.tsx | 186 |
| components/dashboard/LicenseeDashboard | Renew | license_management.edit | Yes | src/components/dashboard/LicenseeDashboard.tsx | 192 |
| components/dashboard/LicenseExpiryBanner | Renew License | application_management.edit | Yes | src/components/dashboard/LicenseExpiryBanner.tsx | 50 |
| components/dashboard/ReturnCard | Final Submit | returns_management.edit | Yes | src/components/dashboard/ReturnCard.tsx | 106 |
| components/dashboard/ReturnCard | Save Draft | returns_management.edit | Yes | src/components/dashboard/ReturnCard.tsx | 115 |
| components/dashboard/widgets/index | Start Application | application_management.edit | Yes | src/components/dashboard/widgets/index.tsx | 247 |
| components/dashboard/widgets/index | View All | — | Yes | src/components/dashboard/widgets/index.tsx | 289 |
| components/dashboard/widgets/index | View All | — | Yes | src/components/dashboard/widgets/index.tsx | 360 |
| components/dashboard/widgets/index | Continue | — | Yes | src/components/dashboard/widgets/index.tsx | 392 |
| components/data-grid/EnterpriseDataGrid | Refresh | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 162 |
| components/data-grid/EnterpriseDataGrid | Columns | report_management.export | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 170 |
| components/data-grid/EnterpriseDataGrid | Export | report_management.export | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 197 |
| components/data-grid/EnterpriseDataGrid | Try again | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 279 |
| components/data-grid/EnterpriseDataGrid | Previous | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 401 |
| components/data-grid/EnterpriseDataGrid | Next | — | Yes | src/components/data-grid/EnterpriseDataGrid.tsx | 411 |
| components/data-grid/GridFilterBar | Filters {activeCount > 0 && } | report_management.create | Yes | src/components/data-grid/GridFilterBar.tsx | 65 |
| components/data-grid/GridFilterBar | Reset | — | Yes | src/components/data-grid/GridFilterBar.tsx | 75 |
| components/documents/dms/DmsActionDialogs | Cancel | — | Yes | src/components/documents/dms/DmsActionDialogs.tsx | 114 |
| components/documents/dms/DmsActionDialogs | Cancel | — | Yes | src/components/documents/dms/DmsActionDialogs.tsx | 235 |
| components/documents/dms/DmsActionDialogs | Cancel | — | Yes | src/components/documents/dms/DmsActionDialogs.tsx | 309 |
| components/documents/dms/DmsActionDialogs | Cancel | — | Yes | src/components/documents/dms/DmsActionDialogs.tsx | 372 |
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
| components/entity-detail/Entity360Header | Structure workspace | — | Yes | src/components/entity-detail/Entity360Header.tsx | 69 |
| components/entity-detail/Entity360Header | Public register | — | Yes | src/components/entity-detail/Entity360Header.tsx | 75 |
| components/entity-detail/Entity360Header | Return to current state | — | Yes | src/components/entity-detail/Entity360Header.tsx | 148 |
| components/entity-detail/Entity360TimelinePanel | Show all domains | — | Yes | src/components/entity-detail/Entity360TimelinePanel.tsx | 54 |
| components/entity-detail/EntityReportingCurrencyPanel | Set override | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 190 |
| components/entity-detail/EntityReportingCurrencyPanel | Cancel | — | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 229 |
| components/entity-detail/EntityReportingCurrencyPanel | GuardedButton | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 230 |
| components/entity-detail/EntityReportingCurrencyPanel | supersede(activeProfile)}> Supersede current override | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 295 |
| components/entity-detail/EntityReportingCurrencyPanel | decide(p, 'APPROVE')} disabled= >Accept proposal | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 332 |
| components/entity-detail/EntityReportingCurrencyPanel | decide(p, 'REJECT')} disabled= >Decline proposal | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 334 |
| components/entity-detail/EntityReportingCurrencyPanel | withdraw(p)} disabled= >Withdraw | licensee_management.edit | Yes | src/components/entity-detail/EntityReportingCurrencyPanel.tsx | 342 |
| components/entity-detail/EntitySupervisory360Panel | Open record | — | Yes | src/components/entity-detail/EntitySupervisory360Panel.tsx | 64 |
| components/entity-detail/InspectionsTab | Add | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 63 |
| components/entity-detail/InspectionsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 99 |
| components/entity-detail/InspectionsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/InspectionsTab.tsx | 99 |
| components/entity-detail/LicensesTab | View | — | Yes | src/components/entity-detail/LicensesTab.tsx | 95 |
| components/entity-detail/LicensingAuditTab | Issue determination | license_management.approve | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 405 |
| components/entity-detail/LicensingAuditTab | Generate risk profile | licensee_management.edit | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 465 |
| components/entity-detail/LicensingAuditTab | Auto-create initial plan | licensee_management.edit | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 493 |
| components/entity-detail/LicensingAuditTab | Open Supervisory Plan | — | Yes | src/components/entity-detail/LicensingAuditTab.tsx | 498 |
| components/entity-detail/OwnershipTreePanel | Diagram | — | Yes | src/components/entity-detail/OwnershipTreePanel.tsx | 175 |
| components/entity-detail/OwnershipTreePanel | List | — | Yes | src/components/entity-detail/OwnershipTreePanel.tsx | 181 |
| components/entity-detail/PrimaryUserCard | Cancel | licensee_management.edit | Yes | src/components/entity-detail/PrimaryUserCard.tsx | 196 |
| components/entity-detail/PrimaryUserCard | Assign as Primary User | licensee_management.edit | Yes | src/components/entity-detail/PrimaryUserCard.tsx | 197 |
| components/entity-detail/ProductsChannelsTab | Add product | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 87 |
| components/entity-detail/ProductsChannelsTab | Add channel | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 117 |
| components/entity-detail/ProductsChannelsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 167 |
| components/entity-detail/ProductsChannelsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/ProductsChannelsTab.tsx | 168 |
| components/entity-detail/RegisterIdentifierDialog | Add identifier | licensee_management.create | Yes | src/components/entity-detail/RegisterIdentifierDialog.tsx | 189 |
| components/entity-detail/RegisterIdentifierDialog | Cancel | — | Yes | src/components/entity-detail/RegisterIdentifierDialog.tsx | 285 |
| components/entity-detail/RegisterIdentifierDialog | Register | — | Yes | src/components/entity-detail/RegisterIdentifierDialog.tsx | 288 |
| components/entity-detail/ReinsuranceTab | Add | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 58 |
| components/entity-detail/ReinsuranceTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 103 |
| components/entity-detail/ReinsuranceTab | Save | licensee_management.edit | Yes | src/components/entity-detail/ReinsuranceTab.tsx | 103 |
| components/entity-detail/RiskRatingsTab | New Assessment | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 83 |
| components/entity-detail/RiskRatingsTab | Cancel | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 116 |
| components/entity-detail/RiskRatingsTab | Save | licensee_management.edit | Yes | src/components/entity-detail/RiskRatingsTab.tsx | 116 |
| components/entity-detail/SupervisoryPlanTab | Generate Initial Supervisory Profile | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 140 |
| components/entity-detail/SupervisoryPlanTab | Add Action | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 179 |
| components/entity-detail/SupervisoryPlanTab | Cancel | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 192 |
| components/entity-detail/SupervisoryPlanTab | Add | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 193 |
| components/entity-detail/SupervisoryPlanTab | Mark complete | prudential_supervision.edit | Yes | src/components/entity-detail/SupervisoryPlanTab.tsx | 238 |
| components/entity-detail/SupervisoryTimelinePanel | All activity | — | Yes | src/components/entity-detail/SupervisoryTimelinePanel.tsx | 36 |
| components/entity-detail/SupervisoryTimelinePanel | ( ) | — | Yes | src/components/entity-detail/SupervisoryTimelinePanel.tsx | 44 |
| components/entity-detail/VerifyIdentifierDialog | Verify | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 141 |
| components/entity-detail/VerifyIdentifierDialog | setMode('reject')}> Reject | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 144 |
| components/entity-detail/VerifyIdentifierDialog | Cancel | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 182 |
| components/entity-detail/VerifyIdentifierDialog | Confirm verification | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 183 |
| components/entity-detail/VerifyIdentifierDialog | Cancel | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 214 |
| components/entity-detail/VerifyIdentifierDialog | Reject verification | licensee_management.edit | Yes | src/components/entity-detail/VerifyIdentifierDialog.tsx | 215 |
| components/entity-detail/WebUsersTab | Cancel | — | Yes | src/components/entity-detail/WebUsersTab.tsx | 412 |
| components/entity-detail/WebUsersTab | Close | — | Yes | src/components/entity-detail/WebUsersTab.tsx | 447 |
| components/entity-detail/WebUsersTab | Cancel | license_management.edit | Yes | src/components/entity-detail/WebUsersTab.tsx | 488 |
| components/entity-detail/WebUsersTab | Save Changes | license_management.edit | Yes | src/components/entity-detail/WebUsersTab.tsx | 489 |
| components/entity/returns-canonical/EntityFilingForm | Mark form complete | licensee_management.edit | Yes | src/components/entity/returns-canonical/EntityFilingForm.tsx | 206 |
| components/entity/returns-canonical/NewReturnDialog | Cancel | — | Yes | src/components/entity/returns-canonical/NewReturnDialog.tsx | 289 |
| components/escalations/EscalationDetailDrawer | Acknowledge | — | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 83 |
| components/escalations/EscalationDetailDrawer | Take ownership | — | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 89 |
| components/escalations/EscalationDetailDrawer | Escalate tier | complaint_management.edit | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 95 |
| components/escalations/EscalationDetailDrawer | Resolve | complaint_management.edit | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 118 |
| components/escalations/EscalationDetailDrawer | resolve.mutate( )}> Resolve &amp; close | complaint_management.edit | Yes | src/components/escalations/EscalationDetailDrawer.tsx | 122 |
| components/fees/FeeOperationsPanel | Refresh | — | Yes | src/components/fees/FeeOperationsPanel.tsx | 98 |
| components/fees/FeeOperationsPanel | Approve | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 136 |
| components/fees/FeeOperationsPanel | Reject | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 140 |
| components/fees/FeeOperationsPanel | Approve | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 191 |
| components/fees/FeeOperationsPanel | Reject | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 194 |
| components/fees/FeeOperationsPanel | Execute | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 200 |
| components/fees/FeeOperationsPanel | Ingest statement | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 239 |
| components/fees/FeeOperationsPanel | Resolve | fee_management.edit | Yes | src/components/fees/FeeOperationsPanel.tsx | 287 |
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
| components/form-builder/FileImport | Import Field(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1936 |
| components/form-builder/FileImport | Create Form(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1952 |
| components/form-builder/FileImport | Import Field(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 1958 |
| components/form-builder/FileImport | Select All | — | Yes | src/components/form-builder/FileImport.tsx | 2035 |
| components/form-builder/FileImport | Deselect All | — | Yes | src/components/form-builder/FileImport.tsx | 2036 |
| components/form-builder/FileImport | Back | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2194 |
| components/form-builder/FileImport | Cancel | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2203 |
| components/form-builder/FileImport | Preview Sheet(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2207 |
| components/form-builder/FileImport | Import Field(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2217 |
| components/form-builder/FileImport | Create Form(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2233 |
| components/form-builder/FileImport | Import Field(s) | form_management.create | Yes | src/components/form-builder/FileImport.tsx | 2240 |
| components/form-builder/SectionManager | Add Section | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 184 |
| components/form-builder/SectionManager | Add First Section | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 194 |
| components/form-builder/SectionManager | col | form_management.edit | Yes | src/components/form-builder/SectionManager.tsx | 400 |
| components/form-builder/VersionDiffViewer | Compare | form_management.edit | Yes | src/components/form-builder/VersionDiffViewer.tsx | 262 |
| components/form-builder/VersionDiffViewer | Side by side | — | Yes | src/components/form-builder/VersionDiffViewer.tsx | 344 |
| components/form-builder/VersionDiffViewer | List | — | Yes | src/components/form-builder/VersionDiffViewer.tsx | 353 |
| components/form-builder/VersionHistory | History | — | Yes | src/components/form-builder/VersionHistory.tsx | 179 |
| components/form-builder/VersionHistory | Cancel | form_management.edit | Yes | src/components/form-builder/VersionHistory.tsx | 408 |
| components/form-builder/VersionHistory | Save schedule | form_management.edit | Yes | src/components/form-builder/VersionHistory.tsx | 409 |
| components/form-renderer/FormRenderer | Upload | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1320 |
| components/form-renderer/FormRenderer | Add Row | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1409 |
| components/form-renderer/FormRenderer | Add Another Entry | form_management.edit | Yes | src/components/form-renderer/FormRenderer.tsx | 1722 |
| components/form-renderer/FormRenderer | Previous | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1735 |
| components/form-renderer/FormRenderer | Next | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1745 |
| components/form-renderer/FormRenderer | Submit | application_management.create | Yes | src/components/form-renderer/FormRenderer.tsx | 1750 |
| components/forms/EmailFieldControl | {cooldown > 0 ? `Resend in $ s` : 'Verify Email'} | — | Yes | src/components/forms/EmailFieldControl.tsx | 222 |
| components/forms/EmailFieldControl | {cooldown > 0 ? `Resend in $ s` : 'Resend code'} | — | Yes | src/components/forms/EmailFieldControl.tsx | 250 |
| components/fpa/AutoScreeningRulesTab | Cancel | — | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 285 |
| components/fpa/AutoScreeningRulesTab | Add Rule | fit_and_proper_screening.create | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 430 |
| components/fpa/AutoScreeningRulesTab | Clear filters | — | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 466 |
| components/fpa/AutoScreeningRulesTab | Edit | fit_and_proper_screening.edit | Yes | src/components/fpa/AutoScreeningRulesTab.tsx | 545 |
| components/governance/ai/LifecycleActions | Cancel | ai_management.edit | Yes | src/components/governance/ai/LifecycleActions.tsx | 123 |
| components/governance/ai/LifecycleActions | Record status change | ai_management.edit | Yes | src/components/governance/ai/LifecycleActions.tsx | 124 |
| components/governance/ReasonDialog | Cancel | — | Yes | src/components/governance/ReasonDialog.tsx | 97 |
| components/landing/AlreadyRegulatedSection | View Licensee Services | — | Yes | src/components/landing/AlreadyRegulatedSection.tsx | 52 |
| components/landing/AlreadyRegulatedSection | Need access to an existing entity? | — | Yes | src/components/landing/AlreadyRegulatedSection.tsx | 55 |
| components/landing/HeroSection | Register Now | — | Yes | src/components/landing/HeroSection.tsx | 24 |
| components/landing/HeroSection | Existing User? Login | — | Yes | src/components/landing/HeroSection.tsx | 27 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 66 |
| components/landing/LandingNav | Apply / Register | — | Yes | src/components/landing/LandingNav.tsx | 69 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 76 |
| components/landing/LandingNav | Sign In | — | Yes | src/components/landing/LandingNav.tsx | 94 |
| components/landing/LandingNav | Apply / Register | — | Yes | src/components/landing/LandingNav.tsx | 97 |
| components/layout/Header | {unreadCount > 0 && ( )} | notification_management.view | Yes | src/components/layout/Header.tsx | 105 |
| components/layout/Header | View Profile | — | Yes | src/components/layout/Header.tsx | 226 |
| components/layout/Header | Logout | — | Yes | src/components/layout/Header.tsx | 231 |
| components/licenses/LicenseActionDialog | Cancel | — | Yes | src/components/licenses/LicenseActionDialog.tsx | 237 |
| components/licenses/LicenseConditionsPanel | Submit evidence | license_management.edit | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 172 |
| components/licenses/LicenseConditionsPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 208 |
| components/licenses/LicenseConditionsPanel | Confirm | license_management.edit | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 209 |
| components/licenses/LicenseConditionsPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 234 |
| components/licenses/LicenseConditionsPanel | Submit for review | license_management.edit | Yes | src/components/licenses/LicenseConditionsPanel.tsx | 235 |
| components/licenses/LicenseDecisionAppealsPanel | Lodge appeal | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 73 |
| components/licenses/LicenseDecisionAppealsPanel | Acknowledge | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 100 |
| components/licenses/LicenseDecisionAppealsPanel | Determine | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 106 |
| components/licenses/LicenseDecisionAppealsPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 150 |
| components/licenses/LicenseDecisionAppealsPanel | Lodge | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 151 |
| components/licenses/LicenseDecisionAppealsPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 181 |
| components/licenses/LicenseDecisionAppealsPanel | Record determination | license_management.edit | Yes | src/components/licenses/LicenseDecisionAppealsPanel.tsx | 182 |
| components/licenses/LicenseFeeLedgerPanel | Record payment | license_management.edit | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 138 |
| components/licenses/LicenseFeeLedgerPanel | Verify | license_management.edit | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 143 |
| components/licenses/LicenseFeeLedgerPanel | setTarget( )}>Waive | license_management.edit | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 146 |
| components/licenses/LicenseFeeLedgerPanel | Cancel | — | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 180 |
| components/licenses/LicenseFeeLedgerPanel | Confirm | — | Yes | src/components/licenses/LicenseFeeLedgerPanel.tsx | 181 |
| components/licenses/LicenseRelatedCasesPanel | Open | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 138 |
| components/licenses/LicenseRelatedCasesPanel | Open | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 173 |
| components/licenses/LicenseRelatedCasesPanel | Open correspondence workspace | — | Yes | src/components/licenses/LicenseRelatedCasesPanel.tsx | 179 |
| components/licenses/LicenseSignaturePanel | Generate Certificate | license_management.edit | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 203 |
| components/licenses/LicenseSignaturePanel | Dispatch to Licensee | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 261 |
| components/licenses/LicenseSignaturePanel | Cancel | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 314 |
| components/licenses/LicenseSignaturePanel | Sign | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 315 |
| components/licenses/LicenseSignaturePanel | Cancel | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 336 |
| components/licenses/LicenseSignaturePanel | Dispatch | license_management.approve | Yes | src/components/licenses/LicenseSignaturePanel.tsx | 337 |
| components/licenses/LicenseVariationPanel | Open variation | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 114 |
| components/licenses/LicenseVariationPanel | setDecide(v)}>Decide | license_management.approve | Yes | src/components/licenses/LicenseVariationPanel.tsx | 137 |
| components/licenses/LicenseVariationPanel | Add change | license_management.create | Yes | src/components/licenses/LicenseVariationPanel.tsx | 203 |
| components/licenses/LicenseVariationPanel | Cancel | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 210 |
| components/licenses/LicenseVariationPanel | Open variation | — | Yes | src/components/licenses/LicenseVariationPanel.tsx | 211 |
| components/licenses/LicenseVariationPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseVariationPanel.tsx | 244 |
| components/licenses/LicenseVariationPanel | Record decision | license_management.edit | Yes | src/components/licenses/LicenseVariationPanel.tsx | 245 |
| components/licenses/LicenseVerificationPanel | Start verification | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 64 |
| components/licenses/LicenseVerificationPanel | Complete | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 89 |
| components/licenses/LicenseVerificationPanel | Record | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 107 |
| components/licenses/LicenseVerificationPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 136 |
| components/licenses/LicenseVerificationPanel | Start | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 137 |
| components/licenses/LicenseVerificationPanel | Cancel | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 166 |
| components/licenses/LicenseVerificationPanel | Save | license_management.edit | Yes | src/components/licenses/LicenseVerificationPanel.tsx | 167 |
| components/notifications/DeadLetterQueue | Resend | — | Yes | src/components/notifications/DeadLetterQueue.tsx | 138 |
| components/notifications/ForwardNotificationDialog | Cancel | notification_management.dispatch | Yes | src/components/notifications/ForwardNotificationDialog.tsx | 116 |
| components/notifications/ForwardNotificationDialog | Forward | notification_management.dispatch | Yes | src/components/notifications/ForwardNotificationDialog.tsx | 117 |
| components/notifications/NotificationDetailDrawer | Open record | notification_management.dispatch | Yes | src/components/notifications/NotificationDetailDrawer.tsx | 123 |
| components/notifications/NotificationDetailDrawer | Mark read | notification_management.dispatch | Yes | src/components/notifications/NotificationDetailDrawer.tsx | 128 |
| components/notifications/NotificationDetailDrawer | onForward(notification)}> Forward | notification_management.dispatch | Yes | src/components/notifications/NotificationDetailDrawer.tsx | 132 |
| components/notifications/NotificationDetailDrawer | Archive | — | Yes | src/components/notifications/NotificationDetailDrawer.tsx | 136 |
| components/notifications/NotificationPreferenceMatrix | Try again | — | Yes | src/components/notifications/NotificationPreferenceMatrix.tsx | 132 |
| components/notifications/NotificationPreferenceMatrix | Reset | notification_management.dispatch | Yes | src/components/notifications/NotificationPreferenceMatrix.tsx | 287 |
| components/notifications/NotificationPreferenceMatrix | Save Changes | notification_management.dispatch | Yes | src/components/notifications/NotificationPreferenceMatrix.tsx | 290 |
| components/notifications/TemplatePreviewDialog | Close | notification_management.test_send | Yes | src/components/notifications/TemplatePreviewDialog.tsx | 131 |
| components/notifications/TemplatePreviewDialog | Send test to me | notification_management.test_send | Yes | src/components/notifications/TemplatePreviewDialog.tsx | 132 |
| components/payments/ApplicationFinancePanel | Refresh | — | Yes | src/components/payments/ApplicationFinancePanel.tsx | 135 |
| components/payments/ApplicationFinancePanel | Reverse payment | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 274 |
| components/payments/ApplicationFinancePanel | Approve | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 320 |
| components/payments/ApplicationFinancePanel | Reject | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 330 |
| components/payments/ApplicationFinancePanel | Submit request | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 366 |
| components/payments/ApplicationFinancePanel | Approve | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 408 |
| components/payments/ApplicationFinancePanel | Reject | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 415 |
| components/payments/ApplicationFinancePanel | Execute | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 425 |
| components/payments/ApplicationFinancePanel | Submit refund request | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 453 |
| components/payments/ApplicationFinancePanel | Resolve | fee_management.edit | Yes | src/components/payments/ApplicationFinancePanel.tsx | 519 |
| components/payments/OfflinePaymentDialog | Cancel | fee_management.edit | Yes | src/components/payments/OfflinePaymentDialog.tsx | 244 |
| components/payments/OfflinePaymentDialog | Submit for verification | fee_management.edit | Yes | src/components/payments/OfflinePaymentDialog.tsx | 245 |
| components/payments/OfflinePaymentDialog | Done | — | Yes | src/components/payments/OfflinePaymentDialog.tsx | 264 |
| components/payments/PaymentAttachments | Upload Proof | fee_management.edit | Yes | src/components/payments/PaymentAttachments.tsx | 144 |
| components/payments/PaymentRemarksThread | Add Remark | fee_management.create | Yes | src/components/payments/PaymentRemarksThread.tsx | 150 |
| components/payments/PaymentRemarksThread | Cancel | fee_management.edit | Yes | src/components/payments/PaymentRemarksThread.tsx | 193 |
| components/payments/PaymentRemarksThread | Save | fee_management.edit | Yes | src/components/payments/PaymentRemarksThread.tsx | 196 |
| components/prudential/CreateFinancialGroupWizard | Edit | — | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 243 |
| components/prudential/CreateFinancialGroupWizard | Add member | — | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 255 |
| components/prudential/CreateFinancialGroupWizard | Cancel | — | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 277 |
| components/prudential/CreateFinancialGroupWizard | Back | prudential_supervision.create | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 336 |
| components/prudential/CreateFinancialGroupWizard | Cancel | prudential_supervision.create | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 339 |
| components/prudential/CreateFinancialGroupWizard | Next | prudential_supervision.create | Yes | src/components/prudential/CreateFinancialGroupWizard.tsx | 341 |
| components/prudential/CreatePrudentialActionDialog | Cancel | — | Yes | src/components/prudential/CreatePrudentialActionDialog.tsx | 106 |
| components/prudential/CreatePrudentialEscalationDialog | Cancel | — | Yes | src/components/prudential/CreatePrudentialEscalationDialog.tsx | 79 |
| components/prudential/EwiPanel | Review | prudential_supervision.workflow_action | Yes | src/components/prudential/EwiPanel.tsx | 149 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 150 |
| components/prudential/examination/DataRequestsPanel | ( ) | — | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 174 |
| components/prudential/examination/DataRequestsPanel | Send request | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 240 |
| components/prudential/examination/DataRequestsPanel | Fully received | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 248 |
| components/prudential/examination/DataRequestsPanel | Partially received | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 252 |
| components/prudential/examination/DataRequestsPanel | Record response | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 258 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 279 |
| components/prudential/examination/DataRequestsPanel | Add request | prudential_supervision.edit | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 337 |
| components/prudential/examination/DataRequestsPanel | Cancel | — | Yes | src/components/prudential/examination/DataRequestsPanel.tsx | 341 |
| components/prudential/examination/EntityExaminationsTab | New examination | prudential_supervision.edit | Yes | src/components/prudential/examination/EntityExaminationsTab.tsx | 17 |
| components/prudential/examination/ExaminationResolveBanner | Return to current step | — | Yes | src/components/prudential/examination/ExaminationResolveBanner.tsx | 29 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 80 |
| components/prudential/examination/ExaminationStageActions | Resolve | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 146 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 166 |
| components/prudential/examination/ExaminationStageActions | Save | prudential_supervision.edit | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 183 |
| components/prudential/examination/ExaminationStageActions | More actions | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 192 |
| components/prudential/examination/ExaminationStageActions | Cancel examination | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/ExaminationStageActions.tsx | 197 |
| components/prudential/examination/FindingsPanel | Create supervisory finding | prudential_supervision.edit | Yes | src/components/prudential/examination/FindingsPanel.tsx | 187 |
| components/prudential/examination/FindingsPanel | Open finding workspace | — | Yes | src/components/prudential/examination/FindingsPanel.tsx | 255 |
| components/prudential/examination/FindingsPanel | Create corrective action | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/FindingsPanel.tsx | 304 |
| components/prudential/examination/FindingsPanel | Close finding | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/FindingsPanel.tsx | 310 |
| components/prudential/examination/NextActionCard | Resolve | prudential_supervision.edit | Yes | src/components/prudential/examination/NextActionCard.tsx | 75 |
| components/prudential/examination/NextActionCard | Go to | — | Yes | src/components/prudential/examination/NextActionCard.tsx | 89 |
| components/prudential/examination/RaiseFindingDialog | Cancel | — | Yes | src/components/prudential/examination/RaiseFindingDialog.tsx | 187 |
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
| components/prudential/examination/TeamPanel | Additional details (optional) | — | Yes | src/components/prudential/examination/TeamPanel.tsx | 202 |
| components/prudential/examination/TeamPanel | Add to team | prudential_supervision.edit | Yes | src/components/prudential/examination/TeamPanel.tsx | 233 |
| components/prudential/examination/TeamPanel | Cancel | — | Yes | src/components/prudential/examination/TeamPanel.tsx | 236 |
| components/prudential/examination/WorkpapersPanel | Add workpaper | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 153 |
| components/prudential/examination/WorkpapersPanel | Edit | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 229 |
| components/prudential/examination/WorkpapersPanel | Submit for review | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 233 |
| components/prudential/examination/WorkpapersPanel | Sign off as preparer | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 239 |
| components/prudential/examination/WorkpapersPanel | Sign off as reviewer | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 247 |
| components/prudential/examination/WorkpapersPanel | Confirm return | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 253 |
| components/prudential/examination/WorkpapersPanel | Return for revision | prudential_supervision.workflow_action | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 262 |
| components/prudential/examination/WorkpapersPanel | Raise finding | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 270 |
| components/prudential/examination/WorkpapersPanel | Add workpaper | prudential_supervision.edit | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 287 |
| components/prudential/examination/WorkpapersPanel | Cancel | — | Yes | src/components/prudential/examination/WorkpapersPanel.tsx | 382 |
| components/prudential/FormulaBuilder | Add | prudential_supervision.create | Yes | src/components/prudential/FormulaBuilder.tsx | 372 |
| components/prudential/GroupEwiPanel | Acknowledge | prudential_supervision.edit | Yes | src/components/prudential/GroupEwiPanel.tsx | 62 |
| components/prudential/GroupStructureTree | Edit | prudential_supervision.edit | Yes | src/components/prudential/GroupStructureTree.tsx | 73 |
| components/prudential/MethodologyRulesEditor | Add rule | — | Yes | src/components/prudential/MethodologyRulesEditor.tsx | 89 |
| components/prudential/payments/IncidentsPanel | Save | prudential_supervision.edit | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 118 |
| components/prudential/payments/IncidentsPanel | Record incident | prudential_supervision.create | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 139 |
| components/prudential/payments/IncidentsPanel | Resolve | prudential_supervision.edit | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 193 |
| components/prudential/payments/IncidentsPanel | Cancel | — | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 268 |
| components/prudential/payments/IncidentsPanel | Cancel | — | Yes | src/components/prudential/payments/IncidentsPanel.tsx | 285 |
| components/prudential/payments/OperatorDialog | Cancel | — | Yes | src/components/prudential/payments/OperatorDialog.tsx | 169 |
| components/prudential/payments/OperatorTable | Add operator | prudential_supervision.create | Yes | src/components/prudential/payments/OperatorTable.tsx | 74 |
| components/prudential/payments/OperatorTable | Edit | prudential_supervision.edit | Yes | src/components/prudential/payments/OperatorTable.tsx | 133 |
| components/prudential/payments/OperatorTable | Start PFMI assessment | prudential_supervision.create | Yes | src/components/prudential/payments/OperatorTable.tsx | 135 |
| components/prudential/payments/RetailPaymentsPanel | Record period figures | prudential_supervision.create | Yes | src/components/prudential/payments/RetailPaymentsPanel.tsx | 94 |
| components/prudential/payments/RetailPaymentsPanel | Cancel | — | Yes | src/components/prudential/payments/RetailPaymentsPanel.tsx | 191 |
| components/prudential/PrudentialActionDrawer | Open source | — | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 69 |
| components/prudential/PrudentialActionDrawer | Accept | prudential_supervision.workflow_action | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 104 |
| components/prudential/PrudentialActionDrawer | Reject | prudential_supervision.workflow_action | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 113 |
| components/prudential/PrudentialActionDrawer | Confirm | prudential_supervision.edit | Yes | src/components/prudential/PrudentialActionDrawer.tsx | 139 |
| components/prudential/PrudentialEntityHistoryDrawer | Refresh | — | Yes | src/components/prudential/PrudentialEntityHistoryDrawer.tsx | 191 |
| components/prudential/RatioEditDialog | Cancel | prudential_supervision.edit | Yes | src/components/prudential/RatioEditDialog.tsx | 252 |
| components/prudential/RiskScoreExplainer | Open supervisory profile | — | Yes | src/components/prudential/RiskScoreExplainer.tsx | 193 |
| components/prudential/RiskScoreExplainer | Review ( ) | — | Yes | src/components/prudential/RiskScoreExplainer.tsx | 202 |
| components/rbac/RoleMigrationRunnerDialog | Close | — | Yes | src/components/rbac/RoleMigrationRunnerDialog.tsx | 219 |
| components/rbac/RoleMigrationRunnerDialog | {running ? 'Running…' : `Classify $ role$ `} | — | Yes | src/components/rbac/RoleMigrationRunnerDialog.tsx | 222 |
| components/registration-builder/FieldEditor | Add Rule | form_management.create | Yes | src/components/registration-builder/FieldEditor.tsx | 530 |
| components/registration-builder/FormPreview | Previous | — | Yes | src/components/registration-builder/FormPreview.tsx | 102 |
| components/registration-builder/FormPreview | Next | — | Yes | src/components/registration-builder/FormPreview.tsx | 105 |
| components/registration-builder/FormPreview | Verify Email | — | Yes | src/components/registration-builder/FormPreview.tsx | 238 |
| components/registration-builder/FullRegistrationPreview | Send Code | form_management.edit | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 144 |
| components/registration-builder/FullRegistrationPreview | Previous | — | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 266 |
| components/registration-builder/FullRegistrationPreview | Next | — | Yes | src/components/registration-builder/FullRegistrationPreview.tsx | 272 |
| components/registration-builder/RegistrationFormBuilderEditor | Preview | form_management.view | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 106 |
| components/registration-builder/RegistrationFormBuilderEditor | Add Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 109 |
| components/registration-builder/RegistrationFormBuilderEditor | Add First Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 119 |
| components/registration-builder/RegistrationFormBuilderEditor | Add Step | form_management.edit | Yes | src/components/registration-builder/RegistrationFormBuilderEditor.tsx | 170 |
| components/registration/DocumentsStep | View | registration_management.view | Yes | src/components/registration/DocumentsStep.tsx | 267 |
| components/registration/DocumentsStep | Download | registration_management.view | Yes | src/components/registration/DocumentsStep.tsx | 268 |
| components/registration/DocumentsStep | Replace | registration_management.edit | Yes | src/components/registration/DocumentsStep.tsx | 269 |
| components/registration/DocumentsStep | Remove | registration_management.edit | Yes | src/components/registration/DocumentsStep.tsx | 270 |
| components/registration/EmailVerificationSection | Send Verification Code | registration_management.create | Yes | src/components/registration/EmailVerificationSection.tsx | 140 |
| components/registration/EmailVerificationSection | {cooldown > 0 ? `Resend in $ s` : 'Resend Code'} | registration_management.create | Yes | src/components/registration/EmailVerificationSection.tsx | 164 |
| components/registration/PendingAuthorityScreen | Check status | — | Yes | src/components/registration/PendingAuthorityScreen.tsx | 53 |
| components/registration/RegistrationStepRenderer | Remove | registration_management.edit | Yes | src/components/registration/RegistrationStepRenderer.tsx | 180 |
| components/registration/RegistrationStepRenderer | + Add another | — | Yes | src/components/registration/RegistrationStepRenderer.tsx | 203 |
| components/registration/RegistrationStepRenderer | Remove | registration_management.edit | Yes | src/components/registration/RegistrationStepRenderer.tsx | 897 |
| components/registration/RegistrationStepRenderer | {uploading ? ( Uploading... ) : ( )} | registration_management.create | Yes | src/components/registration/RegistrationStepRenderer.tsx | 916 |
| components/returns/FilingLifecyclePanel | setRfiOpen(true)} disabled= >Raise information request | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 214 |
| components/returns/FilingLifecyclePanel | setExtOpen(true)} disabled= >Request extension | returns_management.submit | Yes | src/components/returns/FilingLifecyclePanel.tsx | 251 |
| components/returns/FilingLifecyclePanel | decideExt(x, 'GRANT')}>Grant | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 284 |
| components/returns/FilingLifecyclePanel | decideExt(x, 'REFUSE')}>Refuse | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 286 |
| components/returns/FilingLifecyclePanel | Request amendment | returns_management.submit | Yes | src/components/returns/FilingLifecyclePanel.tsx | 311 |
| components/returns/FilingLifecyclePanel | decideAmend(r, 'APPROVE')}>Approve amendment | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 332 |
| components/returns/FilingLifecyclePanel | decideAmend(r, 'REFUSE')}>Refuse amendment | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 334 |
| components/returns/FilingLifecyclePanel | fileRef.current?.click()}> Upload evidence | returns_management.submit | Yes | src/components/returns/FilingLifecyclePanel.tsx | 357 |
| components/returns/FilingLifecyclePanel | Open | — | Yes | src/components/returns/FilingLifecyclePanel.tsx | 386 |
| components/returns/FilingLifecyclePanel | withdrawEvi(e)}>Withdraw | returns_management.submit | Yes | src/components/returns/FilingLifecyclePanel.tsx | 390 |
| components/returns/FilingLifecyclePanel | Cancel | — | Yes | src/components/returns/FilingLifecyclePanel.tsx | 417 |
| components/returns/FilingLifecyclePanel | Issue request | returns_management.workflow_action | Yes | src/components/returns/FilingLifecyclePanel.tsx | 418 |
| components/returns/FilingLifecyclePanel | Cancel | — | Yes | src/components/returns/FilingLifecyclePanel.tsx | 446 |
| components/returns/FilingLifecyclePanel | Submit request | returns_management.submit | Yes | src/components/returns/FilingLifecyclePanel.tsx | 447 |
| components/returns/NotificationDispatchDetailDrawer | Technical details | — | Yes | src/components/returns/NotificationDispatchDetailDrawer.tsx | 198 |
| components/returns/NotificationDispatchDetailDrawer | Payload | — | Yes | src/components/returns/NotificationDispatchDetailDrawer.tsx | 234 |
| components/returns/NotificationDispatchDetailDrawer | Copy | — | Yes | src/components/returns/NotificationDispatchDetailDrawer.tsx | 238 |
| components/returns/ReturnReviewPanel | Go to form | — | Yes | src/components/returns/ReturnReviewPanel.tsx | 61 |
| components/returns/ReturnReviewPanel | Acknowledge & Submit | returns_management.edit | Yes | src/components/returns/ReturnReviewPanel.tsx | 187 |
| components/returns/ReturnUploadPanel | Download XLSX Template | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 298 |
| components/returns/ReturnUploadPanel | Download XML Template | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 302 |
| components/returns/ReturnUploadPanel | Discard | returns_management.edit | Yes | src/components/returns/ReturnUploadPanel.tsx | 360 |
| components/settings/integrations/RetryQueuePanel | Refresh | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 332 |
| components/settings/integrations/RetryQueuePanel | Run worker now | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 336 |
| components/settings/integrations/RetryQueuePanel | Export | settings.view | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 423 |
| components/settings/integrations/RetryQueuePanel | Retry selected ( ) | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 434 |
| components/settings/integrations/RetryQueuePanel | View | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 509 |
| components/settings/integrations/RetryQueuePanel | Retry | settings.view | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 514 |
| components/settings/integrations/RetryQueuePanel | Export | settings.view | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 547 |
| components/settings/integrations/RetryQueuePanel | View | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 607 |
| components/settings/integrations/RetryQueuePanel | Retry | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 612 |
| components/settings/integrations/RetryQueuePanel | Cancel | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 726 |
| components/settings/integrations/RetryQueuePanel | Confirm | — | Yes | src/components/settings/integrations/RetryQueuePanel.tsx | 729 |
| components/shared/AccessDenied | Go to Dashboard | — | Yes | src/components/shared/AccessDenied.tsx | 31 |
| components/shared/BatchDocumentUpload | Add files | settings.edit | Yes | src/components/shared/BatchDocumentUpload.tsx | 181 |
| components/shared/BatchDocumentUpload | Upload {staged.length > 0 ? `($ )` : ''} | settings.edit | Yes | src/components/shared/BatchDocumentUpload.tsx | 189 |
| components/shared/CaptchaWidget | Retry security verification | — | Yes | src/components/shared/CaptchaWidget.tsx | 259 |
| components/shared/DataTableShell | Export | report_management.export | Yes | src/components/shared/DataTableShell.tsx | 92 |
| components/shared/ErrorBoundary | Try again | — | Yes | src/components/shared/ErrorBoundary.tsx | 76 |
| components/shared/ErrorBoundary | Reload page | — | Yes | src/components/shared/ErrorBoundary.tsx | 79 |
| components/supervision/aml/AmlActionDialog | Cancel | — | Yes | src/components/supervision/aml/AmlActionDialog.tsx | 155 |
| components/supervision/aml/AmlAssessmentActions | Submit for supervisory review | aml_supervision.submit | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 141 |
| components/supervision/aml/AmlAssessmentActions | Submission requires the AML/CFT submit capability | aml_supervision.submit | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 151 |
| components/supervision/aml/AmlAssessmentActions | Mark reviewed | aml_supervision.review | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 160 |
| components/supervision/aml/AmlAssessmentActions | Return for revision | aml_supervision.review | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 163 |
| components/supervision/aml/AmlAssessmentActions | Approve assessment | aml_supervision.approve | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 171 |
| components/supervision/aml/AmlAssessmentActions | Return for revision | aml_supervision.approve | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 174 |
| components/supervision/aml/AmlAssessmentActions | Raise supervisory attention | aml_supervision.create | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 182 |
| components/supervision/aml/AmlAssessmentActions | Require reassessment | aml_supervision.create | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 185 |
| components/supervision/aml/AmlAssessmentActions | Confirm priority — | aml_supervision.create | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 203 |
| components/supervision/aml/AmlAssessmentActions | Create supervisory plan — | aml_supervision.create | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 221 |
| components/supervision/aml/AmlAssessmentActions | — | — | Yes | src/components/supervision/aml/AmlAssessmentActions.tsx | 242 |
| components/supervision/aml/AmlEvidenceLinker | Link document | — | Yes | src/components/supervision/aml/AmlEvidenceLinker.tsx | 83 |
| components/supervision/aml/AmlNewAssessmentDialog | Cancel | — | Yes | src/components/supervision/aml/AmlNewAssessmentDialog.tsx | 134 |
| components/supervision/aml/AmlNewAssessmentDialog | Continue | — | Yes | src/components/supervision/aml/AmlNewAssessmentDialog.tsx | 137 |
| components/supervision/aml/AmlSupervisoryActivity | Open supervisory intervention | — | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 171 |
| components/supervision/aml/AmlSupervisoryActivity | Record endorsement decision | aml_supervision.approve | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 214 |
| components/supervision/aml/AmlSupervisoryActivity | Create examination | aml_supervision.examine | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 227 |
| components/supervision/aml/AmlSupervisoryActivity | Requires the AML/CFT examine capability | aml_supervision.examine | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 239 |
| components/supervision/aml/AmlSupervisoryActivity | Open examination workspace | aml_supervision.examine | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 247 |
| components/supervision/aml/AmlSupervisoryActivity | Set scope from assessment | aml_supervision.examine | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 253 |
| components/supervision/aml/AmlSupervisoryActivity | Cancel | — | Yes | src/components/supervision/aml/AmlSupervisoryActivity.tsx | 651 |
| components/supervision/finding/FindingClosurePanel | Cancel | supervisory_spine.edit | Yes | src/components/supervision/finding/FindingClosurePanel.tsx | 141 |
| components/supervision/finding/FindingClosurePanel | Record decision | supervisory_spine.edit | Yes | src/components/supervision/finding/FindingClosurePanel.tsx | 142 |
| components/supervision/finding/RemediationActionCard | Progress | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 240 |
| components/supervision/finding/RemediationActionCard | Validate | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 245 |
| components/supervision/finding/RemediationActionCard | Accept residual deficiency on | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 250 |
| components/supervision/finding/RemediationActionCard | Escalate | supervisory_spine.workflow_action | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 256 |
| components/supervision/finding/RemediationActionCard | Refer to enforcement | enforcement_management.refer | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 261 |
| components/supervision/finding/RemediationActionCard | Require reassessment from | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 265 |
| components/supervision/finding/RemediationActionCard | Cancel | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 306 |
| components/supervision/finding/RemediationActionCard | Record | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 307 |
| components/supervision/finding/RemediationActionCard | Cancel | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 367 |
| components/supervision/finding/RemediationActionCard | Record validation | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 368 |
| components/supervision/finding/RemediationActionCard | Cancel | supervisory_spine.workflow_action | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 438 |
| components/supervision/finding/RemediationActionCard | Escalate | supervisory_spine.workflow_action | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 439 |
| components/supervision/finding/RemediationActionCard | Cancel | enforcement_management.refer | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 474 |
| components/supervision/finding/RemediationActionCard | Refer to enforcement | enforcement_management.refer | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 475 |
| components/supervision/finding/RemediationActionCard | Cancel | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 523 |
| components/supervision/finding/RemediationActionCard | Require reassessment | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 524 |
| components/supervision/finding/RemediationActionCard | Cancel | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 588 |
| components/supervision/finding/RemediationActionCard | Record residual acceptance | supervisory_spine.edit | Yes | src/components/supervision/finding/RemediationActionCard.tsx | 589 |
| components/supervision/RecordDocumentLinks | Link document | — | Yes | src/components/supervision/RecordDocumentLinks.tsx | 110 |
| components/supervision/ThematicClosurePanel | New version | prudential_supervision.create | Yes | src/components/supervision/ThematicClosurePanel.tsx | 181 |
| components/supervision/ThematicClosurePanel | Print / PDF | prudential_supervision.view | Yes | src/components/supervision/ThematicClosurePanel.tsx | 184 |
| components/supervision/ThematicClosurePanel | Prefill from findings & actions | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 213 |
| components/supervision/ThematicClosurePanel | Save draft | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 214 |
| components/supervision/ThematicClosurePanel | Submit for approval | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 223 |
| components/supervision/ThematicClosurePanel | Approve report | prudential_supervision.workflow_action | Yes | src/components/supervision/ThematicClosurePanel.tsx | 235 |
| components/supervision/ThematicClosurePanel | Reject | prudential_supervision.workflow_action | Yes | src/components/supervision/ThematicClosurePanel.tsx | 239 |
| components/supervision/ThematicClosurePanel | Publish report & generate supervisory letters | prudential_supervision.workflow_action | Yes | src/components/supervision/ThematicClosurePanel.tsx | 247 |
| components/supervision/ThematicClosurePanel | Mark dispatched | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 284 |
| components/supervision/ThematicClosurePanel | Cancel | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 315 |
| components/supervision/ThematicClosurePanel | run(async () => { await rejectReport.mutateAsync( ); setRejectTarget(null); }, ' | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 316 |
| components/supervision/ThematicClosurePanel | Submit for closure approval | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 392 |
| components/supervision/ThematicClosurePanel | Approve closure | prudential_supervision.workflow_action | Yes | src/components/supervision/ThematicClosurePanel.tsx | 410 |
| components/supervision/ThematicClosurePanel | Reject closure | prudential_supervision.workflow_action | Yes | src/components/supervision/ThematicClosurePanel.tsx | 414 |
| components/supervision/ThematicClosurePanel | Cancel | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 427 |
| components/supervision/ThematicClosurePanel | run(async () => { await rejectClosure.mutateAsync( ); setRejectOpen(false); setR | prudential_supervision.edit | Yes | src/components/supervision/ThematicClosurePanel.tsx | 428 |
| components/supervision/ThematicFollowUpRegister | Verify | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 101 |
| components/supervision/ThematicFollowUpRegister | Extend | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 105 |
| components/supervision/ThematicFollowUpRegister | Cancel | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 141 |
| components/supervision/ThematicFollowUpRegister | Save verification | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 142 |
| components/supervision/ThematicFollowUpRegister | Cancel | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 163 |
| components/supervision/ThematicFollowUpRegister | Extend | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 164 |
| components/supervision/ThematicFollowUpRegister | Cancel | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 182 |
| components/supervision/ThematicFollowUpRegister | Save | prudential_supervision.edit | Yes | src/components/supervision/ThematicFollowUpRegister.tsx | 183 |
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
| pages/admin/ComplaintTypes | Add Type | complaint_type.create | Yes | src/pages/admin/ComplaintTypes.tsx | 108 |
| pages/admin/ComplaintTypes | Add First Type | complaint_type.create | Yes | src/pages/admin/ComplaintTypes.tsx | 124 |
| pages/admin/ComplaintTypes | Edit | complaint_type.edit | Yes | src/pages/admin/ComplaintTypes.tsx | 153 |
| pages/admin/ComplianceAuditLogs | Apply Filters | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 335 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 338 |
| pages/admin/ComplianceAuditLogs | Trace | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 424 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 427 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 514 |
| pages/admin/ComplianceAuditLogs | Export CSV | compliance_management.export | Yes | src/pages/admin/ComplianceAuditLogs.tsx | 554 |
| pages/admin/conduct/MonitoringRules | Run now | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 112 |
| pages/admin/conduct/MonitoringRules | New rule | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 113 |
| pages/admin/conduct/MonitoringRules | Versions | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 144 |
| pages/admin/conduct/MonitoringRules | Edit | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 145 |
| pages/admin/conduct/MonitoringRules | Cancel | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 195 |
| pages/admin/conduct/MonitoringRules | Save | market_conduct.edit | Yes | src/pages/admin/conduct/MonitoringRules.tsx | 196 |
| pages/admin/conduct/ProductsChannels | Add Product | market_conduct.edit | Yes | src/pages/admin/conduct/ProductsChannels.tsx | 90 |
| pages/admin/conduct/ProductsChannels | Add Channel | market_conduct.edit | Yes | src/pages/admin/conduct/ProductsChannels.tsx | 181 |
| pages/admin/conduct/RiskTaxonomy | Add Category | market_conduct.edit | Yes | src/pages/admin/conduct/RiskTaxonomy.tsx | 85 |
| pages/admin/conduct/TriageRules | Simulate | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 234 |
| pages/admin/conduct/TriageRules | Add Rule | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 235 |
| pages/admin/conduct/TriageRules | Add | market_conduct.edit | Yes | src/pages/admin/conduct/TriageRules.tsx | 351 |
| pages/admin/CorrespondenceTemplates | New template | settings.edit | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 117 |
| pages/admin/CorrespondenceTemplates | Cancel | settings.edit | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 190 |
| pages/admin/CorrespondenceTemplates | Save | settings.edit | Yes | src/pages/admin/CorrespondenceTemplates.tsx | 191 |
| pages/admin/DecisionAuthorityManager | New rule | role_management.manage_config | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 214 |
| pages/admin/DecisionAuthorityManager | openEdit(r)}> | role_management.manage_config | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 272 |
| pages/admin/DecisionAuthorityManager | changeStatus(r, 'retired')}> Retire | role_management.manage_config | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 275 |
| pages/admin/DecisionAuthorityManager | changeStatus(r, 'active')}> Reactivate | role_management.manage_config | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 356 |
| pages/admin/DecisionAuthorityManager | Cancel | — | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 454 |
| pages/admin/DecisionAuthorityManager | GuardedButton | role_management.manage_config | Yes | src/pages/admin/DecisionAuthorityManager.tsx | 455 |
| pages/admin/DecisionOptions | New Option | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 102 |
| pages/admin/DecisionOptions | New Template | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 128 |
| pages/admin/DecisionOptions | Cancel | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 191 |
| pages/admin/DecisionOptions | Save | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 191 |
| pages/admin/DecisionOptions | Cancel | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 216 |
| pages/admin/DecisionOptions | Save | license_management.edit | Yes | src/pages/admin/DecisionOptions.tsx | 216 |
| pages/admin/EntityMemberships | Verify | licensee_management.edit | Yes | src/pages/admin/EntityMemberships.tsx | 138 |
| pages/admin/EntityMemberships | act(() => approve.mutateAsync(m.id), 'Membership approved.')}> Approve | licensee_management.edit | Yes | src/pages/admin/EntityMemberships.tsx | 144 |
| pages/admin/EntityMemberships | { const reason = await askReason('Reject membership request'); if (reason) act(( | licensee_management.edit | Yes | src/pages/admin/EntityMemberships.tsx | 150 |
| pages/admin/EntityMemberships | { const reason = await askReason('Revoke membership'); if (reason) act(() => rev | licensee_management.edit | Yes | src/pages/admin/EntityMemberships.tsx | 159 |
| pages/admin/FeeManagement | Add Fee | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 533 |
| pages/admin/FeeManagement | Add Rule | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 805 |
| pages/admin/FeeManagement | Add Fee Type | fee_management.create | Yes | src/pages/admin/FeeManagement.tsx | 956 |
| pages/admin/FormBuilder | Preview | — | Yes | src/pages/admin/FormBuilder.tsx | 662 |
| pages/admin/FormManagement | Import from Excel | form_management.create | Yes | src/pages/admin/FormManagement.tsx | 378 |
| pages/admin/FormManagement | Add Form | form_management.create | Yes | src/pages/admin/FormManagement.tsx | 393 |
| pages/admin/FormManagement | Open Registration Form Builder | — | Yes | src/pages/admin/FormManagement.tsx | 417 |
| pages/admin/FormManagement | Publish Selected | form_management.publish | Yes | src/pages/admin/FormManagement.tsx | 486 |
| pages/admin/FormManagement | Unpublish Selected | form_management.edit | Yes | src/pages/admin/FormManagement.tsx | 492 |
| pages/admin/FormManagement | Delete Selected | form_management.retire | Yes | src/pages/admin/FormManagement.tsx | 503 |
| pages/admin/FormManagement | Clear Selection | form_management.edit | Yes | src/pages/admin/FormManagement.tsx | 513 |
| pages/admin/FormsPackagesWorkspace | Create missing identities | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 85 |
| pages/admin/FormsPackagesWorkspace | New concept | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 98 |
| pages/admin/FormsPackagesWorkspace | Cancel | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 204 |
| pages/admin/FormsPackagesWorkspace | Create | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 205 |
| pages/admin/FormsPackagesWorkspace | New package | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 253 |
| pages/admin/FormsPackagesWorkspace | Add | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 301 |
| pages/admin/FormsPackagesWorkspace | savePackage.mutate( , , )} > Publish package | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 312 |
| pages/admin/FormsPackagesWorkspace | Cancel | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 387 |
| pages/admin/FormsPackagesWorkspace | Create | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 388 |
| pages/admin/FormsPackagesWorkspace | New rule | form_management.create | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 426 |
| pages/admin/FormsPackagesWorkspace | Resolve | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 488 |
| pages/admin/FormsPackagesWorkspace | Cancel | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 542 |
| pages/admin/FormsPackagesWorkspace | Save | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 543 |
| pages/admin/FormsPackagesWorkspace | Apply suggestion | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 637 |
| pages/admin/FormsPackagesWorkspace | Reconstruct from evidence | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 670 |
| pages/admin/FormsPackagesWorkspace | Mark legacy unknown | form_management.edit | Yes | src/pages/admin/FormsPackagesWorkspace.tsx | 707 |
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
| pages/admin/LicenseAppealPanels | New panel | license_appeals.create | Yes | src/pages/admin/LicenseAppealPanels.tsx | 231 |
| pages/admin/LicenseAppealPanels | Cancel | license_appeals.edit | Yes | src/pages/admin/LicenseAppealPanels.tsx | 351 |
| pages/admin/LicenseAppealPanels | Save | license_appeals.edit | Yes | src/pages/admin/LicenseAppealPanels.tsx | 352 |
| pages/admin/LicenseeDetail | Back to Licensees | — | Yes | src/pages/admin/LicenseeDetail.tsx | 163 |
| pages/admin/ManageLicensees | View | — | Yes | src/pages/admin/ManageLicensees.tsx | 403 |
| pages/admin/ManageWebUsers | Add Web User | user_management.create | Yes | src/pages/admin/ManageWebUsers.tsx | 210 |
| pages/admin/ManageWebUsers | Cancel | — | Yes | src/pages/admin/ManageWebUsers.tsx | 256 |
| pages/admin/MasterConfiguration | Sample Excel | settings.edit | Yes | src/pages/admin/MasterConfiguration.tsx | 256 |
| pages/admin/MasterConfiguration | Import Excel | settings.edit | Yes | src/pages/admin/MasterConfiguration.tsx | 259 |
| pages/admin/MasterConfiguration | Add | settings.edit | Yes | src/pages/admin/MasterConfiguration.tsx | 262 |
| pages/admin/MasterConfiguration | Cancel | — | Yes | src/pages/admin/MasterConfiguration.tsx | 320 |
| pages/admin/MasterDataManagement | Add Type | settings.edit | Yes | src/pages/admin/MasterDataManagement.tsx | 222 |
| pages/admin/MasterDataManagement | Sample Excel | settings.export | Yes | src/pages/admin/MasterDataManagement.tsx | 255 |
| pages/admin/MasterDataManagement | Import Excel | settings.edit | Yes | src/pages/admin/MasterDataManagement.tsx | 258 |
| pages/admin/MasterDataManagement | Add Item | settings.edit | Yes | src/pages/admin/MasterDataManagement.tsx | 261 |
| pages/admin/MasterDataManagement | Cancel | — | Yes | src/pages/admin/MasterDataManagement.tsx | 308 |
| pages/admin/MasterDataManagement | Cancel | — | Yes | src/pages/admin/MasterDataManagement.tsx | 357 |
| pages/admin/ModuleRuleTester | Back to Rule Library | — | Yes | src/pages/admin/ModuleRuleTester.tsx | 26 |
| pages/admin/ModuleRuleTester | Rule Library | — | Yes | src/pages/admin/ModuleRuleTester.tsx | 43 |
| pages/admin/NotificationChannelHealth | Try again | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 66 |
| pages/admin/NotificationChannelHealth | Refresh | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 84 |
| pages/admin/NotificationChannelHealth | Resend | — | Yes | src/pages/admin/NotificationChannelHealth.tsx | 229 |
| pages/admin/NotificationEvents | New event | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 224 |
| pages/admin/NotificationEvents | Configure | notification_management.dispatch | Yes | src/pages/admin/NotificationEvents.tsx | 286 |
| pages/admin/NotificationEvents | Add rule | notification_management.dispatch | Yes | src/pages/admin/NotificationEvents.tsx | 463 |
| pages/admin/NotificationEvents | Cancel | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 566 |
| pages/admin/NotificationEvents | Save configuration | notification_management.manage_events | Yes | src/pages/admin/NotificationEvents.tsx | 567 |
| pages/admin/NotificationHistory | Refresh | — | Yes | src/pages/admin/NotificationHistory.tsx | 129 |
| pages/admin/NotificationHistory | Resend | — | Yes | src/pages/admin/NotificationHistory.tsx | 224 |
| pages/admin/NotificationHistory | Previous | — | Yes | src/pages/admin/NotificationHistory.tsx | 246 |
| pages/admin/NotificationHistory | Next | — | Yes | src/pages/admin/NotificationHistory.tsx | 250 |
| pages/admin/NotificationTemplates | New template | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 252 |
| pages/admin/NotificationTemplates | {`{{$ }}`} | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 392 |
| pages/admin/NotificationTemplates | Cancel | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 417 |
| pages/admin/NotificationTemplates | Save draft | notification_management.manage_templates | Yes | src/pages/admin/NotificationTemplates.tsx | 418 |
| pages/admin/NotificationTemplates | Close | — | Yes | src/pages/admin/NotificationTemplates.tsx | 456 |
| pages/admin/OperatingStructure | Advanced | — | Yes | src/pages/admin/OperatingStructure.tsx | 60 |
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
| pages/admin/PpocManagement | Add Mapping | user_management.create | Yes | src/pages/admin/PpocManagement.tsx | 338 |
| pages/admin/PpocManagement | Cancel | — | Yes | src/pages/admin/PpocManagement.tsx | 488 |
| pages/admin/PreLicenseForms | Add Pre-License Form | form_management.create | Yes | src/pages/admin/PreLicenseForms.tsx | 131 |
| pages/admin/PrudentialEngineOperations | {busy ? 'Running…' : `Run $ `} | — | Yes | src/pages/admin/PrudentialEngineOperations.tsx | 75 |
| pages/admin/RegistrationFormBuilder | Create Configuration | form_management.create | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 466 |
| pages/admin/RegistrationFormBuilder | Add Document Type | form_management.edit | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 748 |
| pages/admin/RegistrationFormBuilder | Add Declaration | form_management.edit | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 810 |
| pages/admin/RegistrationFormBuilder | Cancel | form_management.view | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 818 |
| pages/admin/RegistrationFormBuilder | Preview | form_management.view | Yes | src/pages/admin/RegistrationFormBuilder.tsx | 819 |
| pages/admin/RegistrationReview | Open Review | — | Yes | src/pages/admin/RegistrationReview.tsx | 256 |
| pages/admin/RegistrationReviewDetail | Retry | — | Yes | src/pages/admin/RegistrationReviewDetail.tsx | 381 |
| pages/admin/RegulatorManagement | Add Regulator | settings.edit | Yes | src/pages/admin/RegulatorManagement.tsx | 208 |
| pages/admin/RegulatorManagement | Cancel | settings.edit | Yes | src/pages/admin/RegulatorManagement.tsx | 290 |
| pages/admin/RegulatorManagement | GuardedButton | settings.edit | Yes | src/pages/admin/RegulatorManagement.tsx | 291 |
| pages/admin/ReturnConfiguration | Add Configuration | returns_management.manage_config | Yes | src/pages/admin/ReturnConfiguration.tsx | 121 |
| pages/admin/returns/CutoffConfigPage | Add Cutoff | returns_management.create | Yes | src/pages/admin/returns/CutoffConfigPage.tsx | 50 |
| pages/admin/returns/DueDatesPage | Preview | returns_management.edit | Yes | src/pages/admin/returns/DueDatesPage.tsx | 132 |
| pages/admin/returns/DueDatesPage | {generating ? 'Generating...' : `Generate $ Due Dates`} | returns_management.edit | Yes | src/pages/admin/returns/DueDatesPage.tsx | 133 |
| pages/admin/returns/LateFeesPage | Add Fee Structure | returns_management.create | Yes | src/pages/admin/returns/LateFeesPage.tsx | 58 |
| pages/admin/returns/LateFeesPage | Add | returns_management.edit | Yes | src/pages/admin/returns/LateFeesPage.tsx | 168 |
| pages/admin/returns/ReturnConfigsPage | Add Configuration | returns_management.create | Yes | src/pages/admin/returns/ReturnConfigsPage.tsx | 65 |
| pages/admin/returns/ReturnConfigsPage | Cancel | — | Yes | src/pages/admin/returns/ReturnConfigsPage.tsx | 249 |
| pages/admin/returns/ReturnTypesPage | Add Return Type | returns_management.create | Yes | src/pages/admin/returns/ReturnTypesPage.tsx | 46 |
| pages/admin/RfiAutoRules | New rule | application_management.create | Yes | src/pages/admin/RfiAutoRules.tsx | 195 |
| pages/admin/RfiAutoRules | Cancel | application_management.edit | Yes | src/pages/admin/RfiAutoRules.tsx | 533 |
| pages/admin/RfiAutoRules | Save rule | application_management.edit | Yes | src/pages/admin/RfiAutoRules.tsx | 536 |
| pages/admin/RoleManagement | Classify existing roles | role_management.edit | Yes | src/pages/admin/RoleManagement.tsx | 666 |
| pages/admin/RoleManagement | Create Role | role_management.create | Yes | src/pages/admin/RoleManagement.tsx | 671 |
| pages/admin/RoleManagement | Cancel | — | Yes | src/pages/admin/RoleManagement.tsx | 1296 |
| pages/admin/RoleManagement | Cancel | — | Yes | src/pages/admin/RoleManagement.tsx | 1317 |
| pages/admin/RuleEditor | Library | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 240 |
| pages/admin/RuleEditor | Test rule | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 243 |
| pages/admin/RuleEditor | Save draft | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 246 |
| pages/admin/RuleEditor | Activate | rule_engine.activate | Yes | src/pages/admin/RuleEditor.tsx | 250 |
| pages/admin/RuleEditor | Add condition | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 474 |
| pages/admin/RuleEditor | Add action | rule_engine.edit | Yes | src/pages/admin/RuleEditor.tsx | 600 |
| pages/admin/RuleEditor | View execution history | — | Yes | src/pages/admin/RuleEditor.tsx | 688 |
| pages/admin/RuleLibrary | Export | rule_engine.export | Yes | src/pages/admin/RuleLibrary.tsx | 201 |
| pages/admin/RuleLibrary | New Rule | rule_engine.edit | Yes | src/pages/admin/RuleLibrary.tsx | 204 |
| pages/admin/RuleLibrary | Reset filters | — | Yes | src/pages/admin/RuleLibrary.tsx | 298 |
| pages/admin/RuleLibrary | Previous | — | Yes | src/pages/admin/RuleLibrary.tsx | 425 |
| pages/admin/RuleLibrary | Next | — | Yes | src/pages/admin/RuleLibrary.tsx | 426 |
| pages/admin/RuleLibrary | Open module configuration | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 447 |
| pages/admin/RuleLibrary | Cancel | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 471 |
| pages/admin/RuleLibrary | Deactivate | rule_engine.activate | Yes | src/pages/admin/RuleLibrary.tsx | 472 |
| pages/admin/RuleOverrides | View full entity timeline | — | Yes | src/pages/admin/RuleOverrides.tsx | 256 |
| pages/admin/SecurityEvents | Refresh | audit_management.export | Yes | src/pages/admin/SecurityEvents.tsx | 172 |
| pages/admin/SecurityEvents | Export CSV | audit_management.export | Yes | src/pages/admin/SecurityEvents.tsx | 176 |
| pages/admin/SlaManager | Workflow Designer | workflow_management.view | Yes | src/pages/admin/SlaManager.tsx | 122 |
| pages/admin/SlaManager | Add SLA | workflow_management.edit | Yes | src/pages/admin/SlaManager.tsx | 337 |
| pages/admin/SlaManager | Import CSV | settings.edit | Yes | src/pages/admin/SlaManager.tsx | 759 |
| pages/admin/SlaManager | Save Calendar | workflow_management.edit | Yes | src/pages/admin/SlaManager.tsx | 788 |
| pages/admin/SlaManager | Open DASH-OPS | — | Yes | src/pages/admin/SlaManager.tsx | 994 |
| pages/admin/SlaManager | Refresh | — | Yes | src/pages/admin/SlaManager.tsx | 1182 |
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
| pages/admin/SupportQueue | patch(t.id, )}> Assign to me | support_management.assign | Yes | src/pages/admin/SupportQueue.tsx | 254 |
| pages/admin/SupportQueue | Save notes | support_management.update | Yes | src/pages/admin/SupportQueue.tsx | 351 |
| pages/admin/SupportQueue | Mark resolved | support_management.update | Yes | src/pages/admin/SupportQueue.tsx | 355 |
| pages/admin/SupportQueue | patch(t.id, )}> Close ticket | support_management.close | Yes | src/pages/admin/SupportQueue.tsx | 360 |
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
| pages/analytics/AiInsightsHub | Accept | ai_management.approve | Yes | src/pages/analytics/AiInsightsHub.tsx | 160 |
| pages/analytics/AiInsightsHub | Reject | ai_management.approve | Yes | src/pages/analytics/AiInsightsHub.tsx | 161 |
| pages/analytics/AiInsightsHub | Escalate | ai_management.approve | Yes | src/pages/analytics/AiInsightsHub.tsx | 162 |
| pages/analytics/SupervisoryAiReports | View Report | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 156 |
| pages/analytics/SupervisoryAiReports | Try again | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 263 |
| pages/analytics/SupervisoryAiReports | Clear filters | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 431 |
| pages/analytics/SupervisoryAiReports | More filters {!moreOpen && advancedActive > 0 && ( )} | report_management.create | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 641 |
| pages/analytics/SupervisoryAiReports | Clear filters | — | Yes | src/pages/analytics/SupervisoryAiReports.tsx | 658 |
| pages/appeals/MyAppeals | Try again | — | Yes | src/pages/appeals/MyAppeals.tsx | 91 |
| pages/appeals/MyAppeals | View application | — | Yes | src/pages/appeals/MyAppeals.tsx | 131 |
| pages/appeals/MyAppeals | Lodge an appeal | — | Yes | src/pages/appeals/MyAppeals.tsx | 134 |
| pages/appeals/MyAppeals | View my applications | — | Yes | src/pages/appeals/MyAppeals.tsx | 155 |
| pages/appeals/MyAppeals | Open related application | — | Yes | src/pages/appeals/MyAppeals.tsx | 208 |
| pages/ApplicationForms | Review Entered Data | application_management.edit | Yes | src/pages/ApplicationForms.tsx | 499 |
| pages/ApplicationForms | Review & Submit | application_management.edit | Yes | src/pages/ApplicationForms.tsx | 508 |
| pages/ApplicationForms | Back to Forms | — | Yes | src/pages/ApplicationForms.tsx | 555 |
| pages/applications/ApplicationDetail | Cancel Application | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1223 |
| pages/applications/ApplicationDetail | Request Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1231 |
| pages/applications/ApplicationDetail | Allow Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1391 |
| pages/applications/ApplicationDetail | Deny Edit | application_management.edit | Yes | src/pages/applications/ApplicationDetail.tsx | 1395 |
| pages/applications/ApplicationDetail | {processing ? 'Submitting...' : !taxonomyComplete ? 'Select sector, sub-sector a | application_management.create | Yes | src/pages/applications/ApplicationDetail.tsx | 1530 |
| pages/applications/ApplicationDetail | Cancel | — | Yes | src/pages/applications/ApplicationDetail.tsx | 1560 |
| pages/applications/ApplicationDetail | View Payment Details | — | Yes | src/pages/applications/ApplicationDetail.tsx | 1622 |
| pages/applications/ApplicationQueue | Triage {selected.size > 0 ? `($ )` : ''} | application_management.edit | Yes | src/pages/applications/ApplicationQueue.tsx | 218 |
| pages/applications/ApplicationQueue | {t.countKey && counts ? ( ) : null} | — | Yes | src/pages/applications/ApplicationQueue.tsx | 244 |
| pages/applications/ApplicationQueue | Previous | — | Yes | src/pages/applications/ApplicationQueue.tsx | 492 |
| pages/applications/ApplicationQueue | Next | — | Yes | src/pages/applications/ApplicationQueue.tsx | 501 |
| pages/applications/ApplicationQueue | Cancel | — | Yes | src/pages/applications/ApplicationQueue.tsx | 553 |
| pages/applications/ApplicationQueue | Apply | — | Yes | src/pages/applications/ApplicationQueue.tsx | 554 |
| pages/applications/ApplicationsList | · | application_management.view | Yes | src/pages/applications/ApplicationsList.tsx | 847 |
| pages/applications/ApplicationsList | New Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1262 |
| pages/applications/ApplicationsList | New Pre-Licensee Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1268 |
| pages/applications/ApplicationsList | New Post-Licensee Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1271 |
| pages/applications/ApplicationsList | New Application | application_management.create | Yes | src/pages/applications/ApplicationsList.tsx | 1277 |
| pages/applications/ApplicationsList | Clear filter | — | Yes | src/pages/applications/ApplicationsList.tsx | 1299 |
| pages/applications/ApplicationsList | Export CSV | application_management.export | Yes | src/pages/applications/ApplicationsList.tsx | 1384 |
| pages/applications/ApplicationsList | Compare submissions | application_management.view | Yes | src/pages/applications/ApplicationsList.tsx | 1412 |
| pages/applications/ApplicationsList | Cancel | — | Yes | src/pages/applications/ApplicationsList.tsx | 1420 |
| pages/applications/ApplicationsList | Cancel | — | Yes | src/pages/applications/ApplicationsList.tsx | 1639 |
| pages/applications/ApplicationsList | Open comparison | — | Yes | src/pages/applications/ApplicationsList.tsx | 1640 |
| pages/billing/Penalties | Case | — | Yes | src/pages/billing/Penalties.tsx | 138 |
| pages/complaints/BulkIntake | Process batch | complaint_management.edit | Yes | src/pages/complaints/BulkIntake.tsx | 96 |
| pages/complaints/BulkIntake | Rows | — | Yes | src/pages/complaints/BulkIntake.tsx | 132 |
| pages/complaints/ComplaintDetail | Reprint acknowledgement | complaint_management.edit | Yes | src/pages/complaints/ComplaintDetail.tsx | 339 |
| pages/complaints/ComplaintDetail | Back to Complaints | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 342 |
| pages/complaints/ComplaintDetail | Return to current step | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 597 |
| pages/complaints/ComplaintDetail | Override | complaint_management.edit | Yes | src/pages/complaints/ComplaintDetail.tsx | 651 |
| pages/complaints/ComplaintDetail | View | — | Yes | src/pages/complaints/ComplaintDetail.tsx | 749 |
| pages/complaints/ComplaintsAnalytics | Back to List | — | Yes | src/pages/complaints/ComplaintsAnalytics.tsx | 47 |
| pages/complaints/ComplaintsList | Analytics | complaint_management.view | Yes | src/pages/complaints/ComplaintsList.tsx | 561 |
| pages/complaints/ComplaintsList | Bulk intake | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 564 |
| pages/complaints/ComplaintsList | New Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 567 |
| pages/complaints/ComplaintsList | Track Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 573 |
| pages/complaints/ComplaintsList | File Complaint | complaint_management.create | Yes | src/pages/complaints/ComplaintsList.tsx | 580 |
| pages/complaints/ComplaintsList | More filters | — | Yes | src/pages/complaints/ComplaintsList.tsx | 659 |
| pages/complaints/ComplaintsList | View | — | Yes | src/pages/complaints/ComplaintsList.tsx | 811 |
| pages/complaints/ComplaintsList | Track | — | Yes | src/pages/complaints/ComplaintsList.tsx | 814 |
| pages/complaints/ComplaintsList | Open detail | — | Yes | src/pages/complaints/ComplaintsList.tsx | 926 |
| pages/complaints/ComplaintsList | Reprint acknowledgement | complaint_management.view | Yes | src/pages/complaints/ComplaintsList.tsx | 929 |
| pages/complaints/ComplaintsList | Run / retry triage | complaint_management.edit | Yes | src/pages/complaints/ComplaintsList.tsx | 932 |
| pages/complaints/ComplaintsList | View | — | Yes | src/pages/complaints/ComplaintsList.tsx | 1029 |
| pages/complaints/duplicates/DuplicateDetectionHub | Run detection | complaint_management.edit | Yes | src/pages/complaints/duplicates/DuplicateDetectionHub.tsx | 71 |
| pages/complaints/duplicates/DuplicateDetectionHub | Back to Complaints | — | Yes | src/pages/complaints/duplicates/DuplicateDetectionHub.tsx | 75 |
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
| pages/complaints/rfi-approvals/RfiApprovalQueue | Review | complaint_management.edit | Yes | src/pages/complaints/rfi-approvals/RfiApprovalQueue.tsx | 116 |
| pages/conduct/Conduct360 | Back to entities | — | Yes | src/pages/conduct/Conduct360.tsx | 171 |
| pages/conduct/ConductActions | Issue requirement | market_conduct.issue_enforcement_action | Yes | src/pages/conduct/ConductActions.tsx | 64 |
| pages/conduct/ConductActions | Overdue only | — | Yes | src/pages/conduct/ConductActions.tsx | 107 |
| pages/conduct/ConductAlerts | Acknowledge | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 182 |
| pages/conduct/ConductAlerts | Promote | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 195 |
| pages/conduct/ConductAlerts | Dispose | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 205 |
| pages/conduct/ConductAlerts | Cancel | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 305 |
| pages/conduct/ConductAlerts | Record disposition | market_conduct.edit | Yes | src/pages/conduct/ConductAlerts.tsx | 306 |
| pages/conduct/ConductAlerts | Cancel | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 360 |
| pages/conduct/ConductAlerts | Open investigation | market_conduct.initiate_investigation | Yes | src/pages/conduct/ConductAlerts.tsx | 361 |
| pages/conduct/ConductEntitiesList | Conduct 360 | — | Yes | src/pages/conduct/ConductEntitiesList.tsx | 100 |
| pages/conduct/ConductPatternDetail | Try again | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 99 |
| pages/conduct/ConductPatternDetail | Record review decision | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 129 |
| pages/conduct/ConductPatternDetail | Attach evidence | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 132 |
| pages/conduct/ConductPatternDetail | Signal raised | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 136 |
| pages/conduct/ConductPatternDetail | Raise conduct signal | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 142 |
| pages/conduct/ConductPatternDetail | Alert already raised | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 145 |
| pages/conduct/ConductPatternDetail | Raise conduct alert | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 149 |
| pages/conduct/ConductPatternDetail | Open | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 360 |
| pages/conduct/ConductPatternDetail | Attach evidence | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 396 |
| pages/conduct/ConductPatternDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 593 |
| pages/conduct/ConductPatternDetail | Record decision | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 594 |
| pages/conduct/ConductPatternDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 640 |
| pages/conduct/ConductPatternDetail | Attach evidence | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 641 |
| pages/conduct/ConductPatternDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 674 |
| pages/conduct/ConductPatternDetail | Raise signal | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 675 |
| pages/conduct/ConductPatternDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 708 |
| pages/conduct/ConductPatternDetail | Raise alert | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPatternDetail.tsx | 709 |
| pages/conduct/ConductPatterns | Refresh | — | Yes | src/pages/conduct/ConductPatterns.tsx | 181 |
| pages/conduct/ConductPatterns | Clear filters | — | Yes | src/pages/conduct/ConductPatterns.tsx | 182 |
| pages/conduct/ConductPatterns | Try again | — | Yes | src/pages/conduct/ConductPatterns.tsx | 202 |
| pages/conduct/ConductPatterns | Previous | — | Yes | src/pages/conduct/ConductPatterns.tsx | 289 |
| pages/conduct/ConductPatterns | Next | — | Yes | src/pages/conduct/ConductPatterns.tsx | 293 |
| pages/conduct/ConductPrioritisation | Intervention register | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPrioritisation.tsx | 117 |
| pages/conduct/ConductPrioritisation | Compute prioritisation | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPrioritisation.tsx | 145 |
| pages/conduct/ConductPrioritisation | Propose intervention | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPrioritisation.tsx | 222 |
| pages/conduct/ConductPrioritisation | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPrioritisation.tsx | 287 |
| pages/conduct/ConductPrioritisation | Propose for decision | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductPrioritisation.tsx | 288 |
| pages/conduct/ConductSignalDetail | Try again | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 83 |
| pages/conduct/ConductSignalDetail | Back to signals | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 84 |
| pages/conduct/ConductSignalDetail | setAction('assign')}>Assign owner | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 109 |
| pages/conduct/ConductSignalDetail | Validate | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 111 |
| pages/conduct/ConductSignalDetail | Dismiss | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 113 |
| pages/conduct/ConductSignalDetail | Escalate to alert | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 115 |
| pages/conduct/ConductSignalDetail | Link existing alert | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 117 |
| pages/conduct/ConductSignalDetail | setAction('reopen')}>Reopen | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 121 |
| pages/conduct/ConductSignalDetail | Attach evidence | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 374 |
| pages/conduct/ConductSignalDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 479 |
| pages/conduct/ConductSignalDetail | { await assign.mutateAsync( ); dismissAll(); }}> Assign | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 480 |
| pages/conduct/ConductSignalDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 529 |
| pages/conduct/ConductSignalDetail | Validate | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 530 |
| pages/conduct/ConductSignalDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 595 |
| pages/conduct/ConductSignalDetail | Escalate | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 596 |
| pages/conduct/ConductSignalDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 645 |
| pages/conduct/ConductSignalDetail | Link alert | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 646 |
| pages/conduct/ConductSignalDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 687 |
| pages/conduct/ConductSignalDetail | Attach | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignalDetail.tsx | 688 |
| pages/conduct/ConductSignalDetail | Cancel | — | Yes | src/pages/conduct/ConductSignalDetail.tsx | 712 |
| pages/conduct/ConductSignals | Raise signal | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignals.tsx | 93 |
| pages/conduct/ConductSignals | Try again | — | Yes | src/pages/conduct/ConductSignals.tsx | 166 |
| pages/conduct/ConductSignals | Previous | — | Yes | src/pages/conduct/ConductSignals.tsx | 207 |
| pages/conduct/ConductSignals | Next | — | Yes | src/pages/conduct/ConductSignals.tsx | 209 |
| pages/conduct/ConductSignals | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignals.tsx | 319 |
| pages/conduct/ConductSignals | Raise signal | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductSignals.tsx | 320 |
| pages/conduct/ConductWorkQueue | Sort by priority | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductWorkQueue.tsx | 145 |
| pages/conduct/ConductWorkQueue | Include closed | market_conduct.manage_complaints | Yes | src/pages/conduct/ConductWorkQueue.tsx | 148 |
| pages/conduct/ConductWorkQueue | Clear filters | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 152 |
| pages/conduct/ConductWorkQueue | Open | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 233 |
| pages/conduct/ConductWorkQueue | Previous | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 249 |
| pages/conduct/ConductWorkQueue | Next | — | Yes | src/pages/conduct/ConductWorkQueue.tsx | 250 |
| pages/conduct/EmergingRiskDetail | Back to the register | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 193 |
| pages/conduct/EmergingRiskDetail | Back to the register | — | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 215 |
| pages/conduct/EmergingRiskDetail | Record an assessment | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 246 |
| pages/conduct/EmergingRiskDetail | Link a record | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 249 |
| pages/conduct/EmergingRiskDetail | Record supervisory follow-up | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 252 |
| pages/conduct/EmergingRiskDetail | Change status | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 256 |
| pages/conduct/EmergingRiskDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 503 |
| pages/conduct/EmergingRiskDetail | Record change | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 504 |
| pages/conduct/EmergingRiskDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 572 |
| pages/conduct/EmergingRiskDetail | Record assessment | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 573 |
| pages/conduct/EmergingRiskDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 615 |
| pages/conduct/EmergingRiskDetail | Link record | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 616 |
| pages/conduct/EmergingRiskDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 655 |
| pages/conduct/EmergingRiskDetail | Record follow-up | market_conduct.manage_complaints | Yes | src/pages/conduct/EmergingRiskDetail.tsx | 656 |
| pages/conduct/EmergingRisksRegister | Go to Supervisory Intelligence | — | Yes | src/pages/conduct/EmergingRisksRegister.tsx | 84 |
| pages/conduct/InterventionDetail | Back to the register | — | Yes | src/pages/conduct/InterventionDetail.tsx | 154 |
| pages/conduct/InterventionDetail | Back to the register | — | Yes | src/pages/conduct/InterventionDetail.tsx | 174 |
| pages/conduct/InterventionDetail | Record an endorsement decision | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 216 |
| pages/conduct/InterventionDetail | Change status | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 221 |
| pages/conduct/InterventionDetail | Record the outcome | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 229 |
| pages/conduct/InterventionDetail | Record follow-up | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 232 |
| pages/conduct/InterventionDetail | Link the record | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 237 |
| pages/conduct/InterventionDetail | Reassess the concern | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 242 |
| pages/conduct/InterventionDetail | Open the record | — | Yes | src/pages/conduct/InterventionDetail.tsx | 339 |
| pages/conduct/InterventionDetail | Open the risk | — | Yes | src/pages/conduct/InterventionDetail.tsx | 422 |
| pages/conduct/InterventionDetail | Open the attention item | — | Yes | src/pages/conduct/InterventionDetail.tsx | 443 |
| pages/conduct/InterventionDetail | Open the plan | — | Yes | src/pages/conduct/InterventionDetail.tsx | 462 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 590 |
| pages/conduct/InterventionDetail | Record the decision | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 591 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 635 |
| pages/conduct/InterventionDetail | Record the change | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 636 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 709 |
| pages/conduct/InterventionDetail | Record the outcome | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 710 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 768 |
| pages/conduct/InterventionDetail | Record the follow-up | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 769 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 813 |
| pages/conduct/InterventionDetail | Link the record | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 814 |
| pages/conduct/InterventionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 881 |
| pages/conduct/InterventionDetail | Record the reassessment | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionDetail.tsx | 882 |
| pages/conduct/InterventionsRegister | Prioritisation | market_conduct.manage_complaints | Yes | src/pages/conduct/InterventionsRegister.tsx | 64 |
| pages/conduct/InvestigationClosureQueue | Review | — | Yes | src/pages/conduct/InvestigationClosureQueue.tsx | 73 |
| pages/conduct/InvestigationDetail | Work queue | market_conduct.manage_complaints | Yes | src/pages/conduct/InvestigationDetail.tsx | 61 |
| pages/conduct/Investigations | Conduct work queue | market_conduct.manage_complaints | Yes | src/pages/conduct/Investigations.tsx | 62 |
| pages/conduct/Investigations | Open investigation | — | Yes | src/pages/conduct/Investigations.tsx | 63 |
| pages/conduct/ManagementReporting | Show records | market_conduct.manage_complaints | Yes | src/pages/conduct/ManagementReporting.tsx | 348 |
| pages/conduct/ManagementReporting | Open | market_conduct.run_conduct_analytics | Yes | src/pages/conduct/ManagementReporting.tsx | 578 |
| pages/conduct/ManagementReporting | Export and record | market_conduct.run_conduct_analytics | Yes | src/pages/conduct/ManagementReporting.tsx | 604 |
| pages/conduct/SupervisionLoop | Export Full Conduct Report | market_conduct.run_conduct_analytics | Yes | src/pages/conduct/SupervisionLoop.tsx | 98 |
| pages/conduct/SupervisionLoop | Reset | — | Yes | src/pages/conduct/SupervisionLoop.tsx | 136 |
| pages/conduct/SupervisoryAttentionDetail | Calculate priority | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 248 |
| pages/conduct/SupervisoryAttentionDetail | Confirm priority | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 256 |
| pages/conduct/SupervisoryAttentionDetail | Change status | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 261 |
| pages/conduct/SupervisoryAttentionDetail | Save | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 381 |
| pages/conduct/SupervisoryAttentionDetail | Create plan | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 409 |
| pages/conduct/SupervisoryAttentionDetail | Initiate intervention | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 455 |
| pages/conduct/SupervisoryAttentionDetail | Record reassessment | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 515 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 628 |
| pages/conduct/SupervisoryAttentionDetail | Confirm priority | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 629 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 673 |
| pages/conduct/SupervisoryAttentionDetail | Record change | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 674 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 732 |
| pages/conduct/SupervisoryAttentionDetail | Create draft plan | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 733 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 809 |
| pages/conduct/SupervisoryAttentionDetail | Initiate | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 810 |
| pages/conduct/SupervisoryAttentionDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 866 |
| pages/conduct/SupervisoryAttentionDetail | Record reassessment | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionDetail.tsx | 867 |
| pages/conduct/SupervisoryAttentionRegister | Open | — | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 77 |
| pages/conduct/SupervisoryAttentionRegister | Raise attention item | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 155 |
| pages/conduct/SupervisoryAttentionRegister | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 538 |
| pages/conduct/SupervisoryAttentionRegister | Record attention item | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryAttentionRegister.tsx | 539 |
| pages/conduct/SupervisoryIntelligence | Emerging risk register | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryIntelligence.tsx | 220 |
| pages/conduct/SupervisoryIntelligence | Raise an emerging risk from this position | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryIntelligence.tsx | 355 |
| pages/conduct/SupervisoryIntelligence | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryIntelligence.tsx | 489 |
| pages/conduct/SupervisoryIntelligence | Record risk | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryIntelligence.tsx | 490 |
| pages/conduct/SupervisoryPlanDetail | Back to supervisory attention | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 129 |
| pages/conduct/SupervisoryPlanDetail | Back to supervisory attention | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 149 |
| pages/conduct/SupervisoryPlanDetail | Change status | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 192 |
| pages/conduct/SupervisoryPlanDetail | Add a milestone | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 196 |
| pages/conduct/SupervisoryPlanDetail | Raise an intervention under this plan | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 203 |
| pages/conduct/SupervisoryPlanDetail | Open the attention item | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 312 |
| pages/conduct/SupervisoryPlanDetail | Edit | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 375 |
| pages/conduct/SupervisoryPlanDetail | Mark completed | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 386 |
| pages/conduct/SupervisoryPlanDetail | Open | — | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 452 |
| pages/conduct/SupervisoryPlanDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 555 |
| pages/conduct/SupervisoryPlanDetail | Record the change | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 556 |
| pages/conduct/SupervisoryPlanDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 597 |
| pages/conduct/SupervisoryPlanDetail | Save the milestone | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 598 |
| pages/conduct/SupervisoryPlanDetail | Cancel | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 679 |
| pages/conduct/SupervisoryPlanDetail | Raise the intervention | market_conduct.manage_complaints | Yes | src/pages/conduct/SupervisoryPlanDetail.tsx | 680 |
| pages/conduct/SurveillanceWorkspace | Review | — | Yes | src/pages/conduct/SurveillanceWorkspace.tsx | 138 |
| pages/coordination/CoordinationDetail | Close Case | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 296 |
| pages/coordination/CoordinationDetail | Cancel | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 326 |
| pages/coordination/CoordinationDetail | Close Case | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 327 |
| pages/coordination/CoordinationDetail | Open | — | Yes | src/pages/coordination/CoordinationDetail.tsx | 349 |
| pages/coordination/CoordinationDetail | Post | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 395 |
| pages/coordination/CoordinationDetail | Invite | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 485 |
| pages/coordination/CoordinationDetail | Cancel | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 515 |
| pages/coordination/CoordinationDetail | Invite | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 516 |
| pages/coordination/CoordinationDetail | Clear | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 548 |
| pages/coordination/CoordinationDetail | Block | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 551 |
| pages/coordination/CoordinationDetail | Raise Flag | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 628 |
| pages/coordination/CoordinationDetail | Cancel | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 665 |
| pages/coordination/CoordinationDetail | Raise | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 666 |
| pages/coordination/CoordinationDetail | Resolve | coordination.update | Yes | src/pages/coordination/CoordinationDetail.tsx | 693 |
| pages/coordination/CoordinationList | New Case | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 117 |
| pages/coordination/CoordinationList | Cancel | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 161 |
| pages/coordination/CoordinationList | Create | coordination.create | Yes | src/pages/coordination/CoordinationList.tsx | 162 |
| pages/coordination/CoordinationList | Open | — | Yes | src/pages/coordination/CoordinationList.tsx | 206 |
| pages/correspondence/CorrespondenceDashboard | Open inbox | — | Yes | src/pages/correspondence/CorrespondenceDashboard.tsx | 69 |
| pages/correspondence/CorrespondenceRecords | Export index | correspondence_management.export | Yes | src/pages/correspondence/CorrespondenceRecords.tsx | 28 |
| pages/correspondence/RoutingRulesAdmin | New rule | settings.edit | Yes | src/pages/correspondence/RoutingRulesAdmin.tsx | 61 |
| pages/correspondence/RoutingRulesAdmin | Cancel | notification_management.dispatch | Yes | src/pages/correspondence/RoutingRulesAdmin.tsx | 128 |
| pages/correspondence/RoutingRulesAdmin | Save rule | notification_management.dispatch | Yes | src/pages/correspondence/RoutingRulesAdmin.tsx | 129 |
| pages/correspondence/ThreadWorkspace | Back to work queue | notification_management.dispatch | Yes | src/pages/correspondence/ThreadWorkspace.tsx | 46 |
| pages/correspondence/ThreadWorkspace | Work queue | notification_management.dispatch | Yes | src/pages/correspondence/ThreadWorkspace.tsx | 71 |
| pages/delegation/DelegationRules | New Role Transfer | workflow_management.manage_config | Yes | src/pages/delegation/DelegationRules.tsx | 332 |
| pages/documents/DocumentDetail | Back to Document Register | document_management.edit_metadata | Yes | src/pages/documents/DocumentDetail.tsx | 152 |
| pages/documents/DocumentDetail | Register | document_management.edit_metadata | Yes | src/pages/documents/DocumentDetail.tsx | 168 |
| pages/documents/DocumentDetail | Edit details | document_management.edit_metadata | Yes | src/pages/documents/DocumentDetail.tsx | 172 |
| pages/documents/DocumentDetail | Classify | document_management.classify | Yes | src/pages/documents/DocumentDetail.tsx | 177 |
| pages/documents/DocumentDetail | Verify | document_management.verify | Yes | src/pages/documents/DocumentDetail.tsx | 182 |
| pages/documents/DocumentDetail | Acceptance | document_management.accept | Yes | src/pages/documents/DocumentDetail.tsx | 192 |
| pages/documents/DocumentDetail | Link record | document_management.link_record | Yes | src/pages/documents/DocumentDetail.tsx | 203 |
| pages/documents/DocumentDetail | Restore | document_management.restore | Yes | src/pages/documents/DocumentDetail.tsx | 209 |
| pages/documents/DocumentDetail | Archive | document_management.archive | Yes | src/pages/documents/DocumentDetail.tsx | 222 |
| pages/documents/DocumentDetail | Delete | document_management.delete | Yes | src/pages/documents/DocumentDetail.tsx | 237 |
| pages/documents/DocumentRegister | Retry entity filing | document_management.bulk_manage | Yes | src/pages/documents/DocumentRegister.tsx | 232 |
| pages/enforcement/EnforcementWorkQueue | Include closed | enforcement_management.edit | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 179 |
| pages/enforcement/EnforcementWorkQueue | Clear filters | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 183 |
| pages/enforcement/EnforcementWorkQueue | Previous | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 284 |
| pages/enforcement/EnforcementWorkQueue | Next | — | Yes | src/pages/enforcement/EnforcementWorkQueue.tsx | 285 |
| pages/enforcement/EnforcementWorkspace | Back to the enforcement queue | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 235 |
| pages/enforcement/EnforcementWorkspace | Enforcement queue | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 257 |
| pages/enforcement/EnforcementWorkspace | Cancel | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 802 |
| pages/enforcement/EnforcementWorkspace | Confirm | — | Yes | src/pages/enforcement/EnforcementWorkspace.tsx | 803 |
| pages/entities/Entity360Detail | Return to current state | — | Yes | src/pages/entities/Entity360Detail.tsx | 184 |
| pages/entities/EntityDirectory | Search registry | — | Yes | src/pages/entities/EntityDirectory.tsx | 256 |
| pages/entities/EntityDirectory | Clear | — | Yes | src/pages/entities/EntityDirectory.tsx | 260 |
| pages/entities/EntityStructureHub | Entity 360 | — | Yes | src/pages/entities/EntityStructureHub.tsx | 121 |
| pages/entities/EntityStructureHub | Start request | licensee_management.edit | Yes | src/pages/entities/EntityStructureHub.tsx | 346 |
| pages/entities/EntityStructureHub | transition.mutate( , )} >Approve | licensee_management.edit | Yes | src/pages/entities/EntityStructureHub.tsx | 421 |
| pages/entities/EntityStructureHub | transition.mutate( , )} >Reject | licensee_management.edit | Yes | src/pages/entities/EntityStructureHub.tsx | 427 |
| pages/entities/EntityStructureHub | Apply | — | Yes | src/pages/entities/EntityStructureHub.tsx | 436 |
| pages/entity/complaint-rfis/MyComplaintRfis | Submit for review | complaint_management.submit | Yes | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 160 |
| pages/entity/complaint-rfis/MyComplaintRfis | Attach document | complaint_management.edit | Yes | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 288 |
| pages/entity/complaint-rfis/MyComplaintRfis | Attach document (optional) | complaint_management.edit | Yes | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 310 |
| pages/entity/complaint-rfis/MyComplaintRfis | Save draft | complaint_management.edit | Yes | src/pages/entity/complaint-rfis/MyComplaintRfis.tsx | 316 |
| pages/entity/correspondence/MyCorrespondence | Open | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 89 |
| pages/entity/correspondence/MyCorrespondence | Previous | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 103 |
| pages/entity/correspondence/MyCorrespondence | Next | — | Yes | src/pages/entity/correspondence/MyCorrespondence.tsx | 105 |
| pages/entity/correspondence/MyCorrespondenceDetail | Back | — | Yes | src/pages/entity/correspondence/MyCorrespondenceDetail.tsx | 53 |
| pages/entity/correspondence/MyCorrespondenceDetail | Back to my correspondence | — | Yes | src/pages/entity/correspondence/MyCorrespondenceDetail.tsx | 63 |
| pages/entity/MySupervisoryActions | Submit response | licensee_management.edit | Yes | src/pages/entity/MySupervisoryActions.tsx | 65 |
| pages/entity/MySupervisoryActions | Cancel | licensee_management.edit | Yes | src/pages/entity/MySupervisoryActions.tsx | 78 |
| pages/entity/MySupervisoryActions | Respond | licensee_management.edit | Yes | src/pages/entity/MySupervisoryActions.tsx | 82 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Validate | returns_management.edit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 148 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Review &amp; submit | returns_management.submit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 152 |
| pages/entity/returns/canonical/EntityFilingWorkspace | . {status === 'issue' && ( )} | returns_management.submit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 273 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Review &amp; submit | returns_management.submit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 295 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Previous form | — | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 336 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Open form | — | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 390 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Validate return | returns_management.edit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 471 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Submit return | returns_management.submit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 475 |
| pages/entity/returns/canonical/EntityFilingWorkspace | Submit response | returns_management.submit | Yes | src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx | 581 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | New Return | returns_management.create | Yes | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 128 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | New Return | returns_management.create | Yes | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 177 |
| pages/entity/returns/canonical/EntityReturnsWorkspace | Open | — | Yes | src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx | 280 |
| pages/entity/returns/CreateReturnPage | Next | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 329 |
| pages/entity/returns/CreateReturnPage | Back | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 363 |
| pages/entity/returns/CreateReturnPage | Next | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 364 |
| pages/entity/returns/CreateReturnPage | Back | — | Yes | src/pages/entity/returns/CreateReturnPage.tsx | 382 |
| pages/entity/returns/EntityReturnsDashboard | Go to Returns workspace | returns_management.create | Yes | src/pages/entity/returns/EntityReturnsDashboard.tsx | 66 |
| pages/entity/returns/EntityReturnsDashboard | New Return | returns_management.create | Yes | src/pages/entity/returns/EntityReturnsDashboard.tsx | 69 |
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
| pages/fpa/FpaAssessmentWorkspace | Back to F&P processes | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 196 |
| pages/fpa/FpaAssessmentWorkspace | F&P processes | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 215 |
| pages/fpa/FpaAssessmentWorkspace | Return to current step | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 255 |
| pages/fpa/FpaAssessmentWorkspace | {a.requires_reason && pendingAction?.code !== a.code ? a.label : `Confirm: $ `} | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 330 |
| pages/fpa/FpaAssessmentWorkspace | Request declaration | fit_and_proper.edit | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 389 |
| pages/fpa/FpaAssessmentWorkspace | Open | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 473 |
| pages/fpa/FpaAssessmentWorkspace | Assign | fit_and_proper.workflow_action | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 516 |
| pages/fpa/FpaAssessmentWorkspace | Open case | — | Yes | src/pages/fpa/FpaAssessmentWorkspace.tsx | 742 |
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
| pages/fpa/FpaIndividualProfile | Reassessment scheduler | fit_and_proper.create | Yes | src/pages/fpa/FpaIndividualProfile.tsx | 499 |
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
| pages/fpa/FpaScreening | Add Config | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 459 |
| pages/fpa/FpaScreening | Run Now | fit_and_proper_screening.edit | Yes | src/pages/fpa/FpaScreening.tsx | 494 |
| pages/fpa/FpaScreening | Cancel | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 772 |
| pages/fpa/FpaScreening | Add Configuration | fit_and_proper_screening.create | Yes | src/pages/fpa/FpaScreening.tsx | 775 |
| pages/fpa/FpaScreening | Cancel | — | Yes | src/pages/fpa/FpaScreening.tsx | 928 |
| pages/fpa/FpaScreening | Close | — | Yes | src/pages/fpa/FpaScreening.tsx | 1018 |
| pages/fpa/FpaSectorRules | Cancel | — | Yes | src/pages/fpa/FpaSectorRules.tsx | 439 |
| pages/fpa/FpaSectorRules | Add Rule | fit_and_proper.create | Yes | src/pages/fpa/FpaSectorRules.tsx | 615 |
| pages/fpa/FpaSectorRules | Clear filters | — | Yes | src/pages/fpa/FpaSectorRules.tsx | 653 |
| pages/fpa/FpaSectorRules | Edit | fit_and_proper.edit | Yes | src/pages/fpa/FpaSectorRules.tsx | 762 |
| pages/fpa/FpaTrends | Export MI Summary | fit_and_proper.export | Yes | src/pages/fpa/FpaTrends.tsx | 455 |
| pages/governance/ai/AiActivityDetail | Back to the activity register | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 66 |
| pages/governance/ai/AiActivityDetail | Activity register | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 75 |
| pages/governance/ai/AiActivityDetail | Open Conduct 360 for this entity | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 97 |
| pages/governance/ai/AiActivityDetail | Start assurance review | ai_management.edit | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 272 |
| pages/governance/ai/AiActivityDetail | Open review | — | Yes | src/pages/governance/ai/AiActivityDetail.tsx | 289 |
| pages/governance/ai/AiActivityRegister | Open Conduct 360 | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 85 |
| pages/governance/ai/AiActivityRegister | Previous | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 178 |
| pages/governance/ai/AiActivityRegister | Next | — | Yes | src/pages/governance/ai/AiActivityRegister.tsx | 179 |
| pages/governance/ai/AiAssurance | Open a review | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 72 |
| pages/governance/ai/AiAssurance | Open | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 161 |
| pages/governance/ai/AiAssurance | Cancel | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 211 |
| pages/governance/ai/AiAssurance | Open review | — | Yes | src/pages/governance/ai/AiAssurance.tsx | 212 |
| pages/governance/ai/AiAssuranceDetail | Back to assurance | — | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 68 |
| pages/governance/ai/AiAssuranceDetail | All assurance reviews | — | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 82 |
| pages/governance/ai/AiAssuranceDetail | Open the full AI activity record | — | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 156 |
| pages/governance/ai/AiAssuranceDetail | Record remediation | ai_management.edit | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 255 |
| pages/governance/ai/AiAssuranceDetail | conclude.mutate( )} > Conclude review | ai_management.approve | Yes | src/pages/governance/ai/AiAssuranceDetail.tsx | 314 |
| pages/governance/ai/AiExceptions | Open | ai_management.edit | Yes | src/pages/governance/ai/AiExceptions.tsx | 153 |
| pages/governance/ai/AiExceptions | Start assurance | ai_management.edit | Yes | src/pages/governance/ai/AiExceptions.tsx | 157 |
| pages/governance/ai/AiGovernanceOverview | AI activity register | — | Yes | src/pages/governance/ai/AiGovernanceOverview.tsx | 136 |
| pages/governance/ai/AiGovernanceOverview | Cancel | — | Yes | src/pages/governance/ai/AiGovernanceOverview.tsx | 290 |
| pages/governance/ai/AiInstructions | Register an instruction version | ai_management.edit | Yes | src/pages/governance/ai/AiInstructions.tsx | 84 |
| pages/governance/ai/AiInstructions | Full instruction as held on the server | ai_management.create | Yes | src/pages/governance/ai/AiInstructions.tsx | 162 |
| pages/governance/ai/AiInstructions | Create new version | ai_management.create | Yes | src/pages/governance/ai/AiInstructions.tsx | 188 |
| pages/governance/ai/AiInstructions | Edit draft | ai_management.edit | Yes | src/pages/governance/ai/AiInstructions.tsx | 191 |
| pages/governance/ai/AiInstructions | Cancel | ai_management.edit | Yes | src/pages/governance/ai/AiInstructions.tsx | 272 |
| pages/governance/ai/AiInstructions | Save as draft | ai_management.edit | Yes | src/pages/governance/ai/AiInstructions.tsx | 273 |
| pages/governance/ai/AiModels | Register a model version | ai_management.edit | Yes | src/pages/governance/ai/AiModels.tsx | 97 |
| pages/governance/ai/AiModels | Create new version | ai_management.create | Yes | src/pages/governance/ai/AiModels.tsx | 187 |
| pages/governance/ai/AiModels | Edit draft | ai_management.edit | Yes | src/pages/governance/ai/AiModels.tsx | 190 |
| pages/governance/ai/AiModels | Cancel | ai_management.edit | Yes | src/pages/governance/ai/AiModels.tsx | 285 |
| pages/governance/ai/AiModels | Save as draft | ai_management.edit | Yes | src/pages/governance/ai/AiModels.tsx | 286 |
| pages/governance/ai/AiSurfaces | { setTarget( ); setReason(''); }}> Reinstate | ai_management.edit | Yes | src/pages/governance/ai/AiSurfaces.tsx | 115 |
| pages/governance/ai/AiSurfaces | { setTarget( ); setReason(''); }}> Suspend | ai_management.edit | Yes | src/pages/governance/ai/AiSurfaces.tsx | 120 |
| pages/governance/ai/AiSurfaces | Cancel | ai_management.edit | Yes | src/pages/governance/ai/AiSurfaces.tsx | 159 |
| pages/governance/ai/AiSurfaces | Record decision | ai_management.edit | Yes | src/pages/governance/ai/AiSurfaces.tsx | 160 |
| pages/governance/ai/AiUseCaseDetail | Back to capabilities | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 56 |
| pages/governance/ai/AiUseCaseDetail | All capabilities | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 65 |
| pages/governance/ai/AiUseCaseDetail | Open model register | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 149 |
| pages/governance/ai/AiUseCaseDetail | Open instruction register | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 170 |
| pages/governance/ai/AiUseCaseDetail | Open | — | Yes | src/pages/governance/ai/AiUseCaseDetail.tsx | 218 |
| pages/governance/ai/AiUseCases | Open | — | Yes | src/pages/governance/ai/AiUseCases.tsx | 105 |
| pages/help/UserManual | Print / PDF | — | Yes | src/pages/help/UserManual.tsx | 363 |
| pages/help/UserManual | Previous | — | Yes | src/pages/help/UserManual.tsx | 444 |
| pages/help/UserManual | Next | — | Yes | src/pages/help/UserManual.tsx | 447 |
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
| pages/intelligence/RelationshipIntelligenceSearch | Search | — | Yes | src/pages/intelligence/RelationshipIntelligenceSearch.tsx | 113 |
| pages/intelligence/RelationshipIntelligenceSearch | Run projection sweep | entity_structure.apply | Yes | src/pages/intelligence/RelationshipIntelligenceSearch.tsx | 181 |
| pages/licenses/LicenseDetail | Download Certificate | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 653 |
| pages/licenses/LicenseDetail | Renewal in progress | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 745 |
| pages/licenses/LicenseDetail | Continue Renewal | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 750 |
| pages/licenses/LicenseDetail | Renewal in progress | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 774 |
| pages/licenses/LicenseDetail | Continue Renewal | license_management.view | Yes | src/pages/licenses/LicenseDetail.tsx | 778 |
| pages/licenses/LicenseDetail | Renew License | license_management.edit | Yes | src/pages/licenses/LicenseDetail.tsx | 782 |
| pages/licenses/LicenseDetail | View submitted form | — | Yes | src/pages/licenses/LicenseDetail.tsx | 821 |
| pages/licenses/LicenseLifecycleQueue | Previous | — | Yes | src/pages/licenses/LicenseLifecycleQueue.tsx | 149 |
| pages/licenses/LicenseLifecycleQueue | Next | — | Yes | src/pages/licenses/LicenseLifecycleQueue.tsx | 152 |
| pages/licenses/LicensesList | Clear filter | — | Yes | src/pages/licenses/LicensesList.tsx | 249 |
| pages/licenses/LicensesList | Open | — | Yes | src/pages/licenses/LicensesList.tsx | 305 |
| pages/licenses/LicensesList | Previous | — | Yes | src/pages/licenses/LicensesList.tsx | 323 |
| pages/licenses/LicensesList | Next | — | Yes | src/pages/licenses/LicensesList.tsx | 324 |
| pages/licenses/LicensesList | View | license_management.view | Yes | src/pages/licenses/LicensesList.tsx | 372 |
| pages/licenses/LicensesList | Certificate | license_management.view | Yes | src/pages/licenses/LicensesList.tsx | 375 |
| pages/licensing/EntityResolutionDetail | Request more evidence | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 312 |
| pages/licensing/EntityResolutionDetail | Submit for supervisor review | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 321 |
| pages/licensing/EntityResolutionDetail | run('APPROVE', null, supervisorNotes)} > Approve recommendation | registration_management.approve | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 395 |
| pages/licensing/EntityResolutionDetail | Return for review | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 403 |
| pages/licensing/EntityResolutionDetail | Request more evidence | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 412 |
| pages/licensing/EntityResolutionDetail | Preview impact | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 519 |
| pages/licensing/EntityResolutionDetail | Execute merge | registration_management.edit | Yes | src/pages/licensing/EntityResolutionDetail.tsx | 537 |
| pages/licensing/EntityResolutionQueue | Review | — | Yes | src/pages/licensing/EntityResolutionQueue.tsx | 204 |
| pages/licensing/OnboardingWorkspace | Refresh | — | Yes | src/pages/licensing/OnboardingWorkspace.tsx | 142 |
| pages/licensing/OnboardingWorkspace | Search | — | Yes | src/pages/licensing/OnboardingWorkspace.tsx | 204 |
| pages/licensing/RegulatoryRequestsRegister | Open | — | Yes | src/pages/licensing/RegulatoryRequestsRegister.tsx | 157 |
| pages/Login | Verify & Continue | — | Yes | src/pages/Login.tsx | 181 |
| pages/Login | Resend code | — | Yes | src/pages/Login.tsx | 185 |
| pages/Login | Cancel and sign out | — | Yes | src/pages/Login.tsx | 195 |
| pages/MailSms | Send Message | notification_management.dispatch | Yes | src/pages/MailSms.tsx | 70 |
| pages/NewApplication | Go to My Applications | — | Yes | src/pages/NewApplication.tsx | 1861 |
| pages/NewApplication | Back | — | Yes | src/pages/NewApplication.tsx | 1864 |
| pages/NewApplication | Proceed to Forms | — | Yes | src/pages/NewApplication.tsx | 2068 |
| pages/NewApplication | Review Entered Data | — | Yes | src/pages/NewApplication.tsx | 2155 |
| pages/NewApplication | Close Review | application_management.edit | Yes | src/pages/NewApplication.tsx | 2192 |
| pages/NewApplication | Back | application_management.create | Yes | src/pages/NewApplication.tsx | 2199 |
| pages/NewApplication | {allFormsCompleted ? 'Continue' : `Complete all forms ($ /$ )`} | application_management.create | Yes | src/pages/NewApplication.tsx | 2202 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2288 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2308 |
| pages/NewApplication | Back to Forms | — | Yes | src/pages/NewApplication.tsx | 2354 |
| pages/NewApplication | Continue to Review | — | Yes | src/pages/NewApplication.tsx | 2357 |
| pages/NewApplication | Retry Payment | — | Yes | src/pages/NewApplication.tsx | 2518 |
| pages/NewApplication | Back to Review | — | Yes | src/pages/NewApplication.tsx | 2527 |
| pages/NewApplication | Back to Documents | — | Yes | src/pages/NewApplication.tsx | 2618 |
| pages/NewApplication | Continue to Payment | — | Yes | src/pages/NewApplication.tsx | 2622 |
| pages/NewPostLicenseApplication | View my applications | — | Yes | src/pages/NewPostLicenseApplication.tsx | 278 |
| pages/NewPostLicenseApplication | View my licences | — | Yes | src/pages/NewPostLicenseApplication.tsx | 279 |
| pages/NewPostLicenseApplication | Open existing request | — | Yes | src/pages/NewPostLicenseApplication.tsx | 379 |
| pages/NewPostLicenseApplication | Proceed to Application | — | Yes | src/pages/NewPostLicenseApplication.tsx | 387 |
| pages/notifications/NotificationCenter | Export | — | Yes | src/pages/notifications/NotificationCenter.tsx | 166 |
| pages/notifications/NotificationCenter | Refresh | — | Yes | src/pages/notifications/NotificationCenter.tsx | 169 |
| pages/notifications/NotificationCenter | Mark all read | — | Yes | src/pages/notifications/NotificationCenter.tsx | 173 |
| pages/notifications/NotificationCenter | Mark read | — | Yes | src/pages/notifications/NotificationCenter.tsx | 274 |
| pages/notifications/NotificationCenter | Dismiss | — | Yes | src/pages/notifications/NotificationCenter.tsx | 285 |
| pages/notifications/NotificationCenter | Archive | — | Yes | src/pages/notifications/NotificationCenter.tsx | 294 |
| pages/notifications/NotificationCenter | Export selected | — | Yes | src/pages/notifications/NotificationCenter.tsx | 305 |
| pages/notifications/NotificationCenter | Try again | — | Yes | src/pages/notifications/NotificationCenter.tsx | 324 |
| pages/notifications/NotificationCenter | Clear filters | — | Yes | src/pages/notifications/NotificationCenter.tsx | 338 |
| pages/notifications/NotificationCenter | Load more | — | Yes | src/pages/notifications/NotificationCenter.tsx | 427 |
| pages/payments/PaymentHistory | View | — | Yes | src/pages/payments/PaymentHistory.tsx | 436 |
| pages/persons/PersonIdentityQueue | setTarget(r)} > Resolve | licensee_management.edit | Yes | src/pages/persons/PersonIdentityQueue.tsx | 141 |
| pages/persons/PersonIdentityQueue | Cancel | licensee_management.edit | Yes | src/pages/persons/PersonIdentityQueue.tsx | 191 |
| pages/persons/PersonIdentityQueue | Confirm link | licensee_management.edit | Yes | src/pages/persons/PersonIdentityQueue.tsx | 192 |
| pages/PostLicenseApplicationForms | Review Entered Data | application_management.edit | Yes | src/pages/PostLicenseApplicationForms.tsx | 629 |
| pages/PostLicenseApplicationForms | Review Application | application_management.edit | Yes | src/pages/PostLicenseApplicationForms.tsx | 637 |
| pages/PostLicenseApplicationForms | Back to Forms | — | Yes | src/pages/PostLicenseApplicationForms.tsx | 684 |
| pages/PostLicenseApplicationForms | Back to Review | — | Yes | src/pages/PostLicenseApplicationForms.tsx | 715 |
| pages/PreLicenseeDashboard | New Application | application_management.create | Yes | src/pages/PreLicenseeDashboard.tsx | 128 |
| pages/Profile | Save Changes | user_management.edit | Yes | src/pages/Profile.tsx | 275 |
| pages/Profile | Change Photo | user_management.edit | Yes | src/pages/Profile.tsx | 293 |
| pages/Profile | Manage | user_management.edit | Yes | src/pages/Profile.tsx | 376 |
| pages/Profile | Close | user_management.edit | Yes | src/pages/Profile.tsx | 460 |
| pages/Profile | Sign out of all other sessions | user_management.edit | Yes | src/pages/Profile.tsx | 461 |
| pages/prudential/ActionsList | Sweep overdue | prudential_supervision.edit | Yes | src/pages/prudential/ActionsList.tsx | 63 |
| pages/prudential/ActionsList | Sweep breaches | prudential_supervision.edit | Yes | src/pages/prudential/ActionsList.tsx | 67 |
| pages/prudential/ActionsList | New action | prudential_supervision.create | Yes | src/pages/prudential/ActionsList.tsx | 71 |
| pages/prudential/ActionsList | Open | — | Yes | src/pages/prudential/ActionsList.tsx | 156 |
| pages/prudential/AssessmentsList | New assessment | prudential_supervision.create | Yes | src/pages/prudential/AssessmentsList.tsx | 34 |
| pages/prudential/AssessmentWorkspace | Back to prudential work | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 147 |
| pages/prudential/AssessmentWorkspace | Prudential work | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 157 |
| pages/prudential/AssessmentWorkspace | Return to current step | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 186 |
| pages/prudential/AssessmentWorkspace | Resolve | prudential_supervision.edit | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 221 |
| pages/prudential/AssessmentWorkspace | Raise action | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 388 |
| pages/prudential/AssessmentWorkspace | Raise action | — | Yes | src/pages/prudential/AssessmentWorkspace.tsx | 428 |
| pages/prudential/EscalationsList | New escalation | prudential_supervision.create | Yes | src/pages/prudential/EscalationsList.tsx | 53 |
| pages/prudential/EscalationsList | All | — | Yes | src/pages/prudential/EscalationsList.tsx | 60 |
| pages/prudential/EscalationsList | Review | prudential_supervision.view | Yes | src/pages/prudential/EscalationsList.tsx | 96 |
| pages/prudential/EscalationsList | Resolve | prudential_supervision.edit | Yes | src/pages/prudential/EscalationsList.tsx | 98 |
| pages/prudential/EscalationsList | Back | — | Yes | src/pages/prudential/EscalationsList.tsx | 120 |
| pages/prudential/ExaminationsList | New examination | prudential_supervision.create | Yes | src/pages/prudential/ExaminationsList.tsx | 99 |
| pages/prudential/ExaminationWorkspace | Examinations | — | Yes | src/pages/prudential/ExaminationWorkspace.tsx | 269 |
| pages/prudential/ExaminationWorkspace | Open | — | Yes | src/pages/prudential/ExaminationWorkspace.tsx | 488 |
| pages/prudential/FinancialGroupProfile | All groups | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 120 |
| pages/prudential/FinancialGroupProfile | Recompute | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 144 |
| pages/prudential/FinancialGroupProfile | Edit group | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 154 |
| pages/prudential/FinancialGroupProfile | Refresh | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 164 |
| pages/prudential/FinancialGroupProfile | Add member | prudential_supervision.create | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 235 |
| pages/prudential/FinancialGroupProfile | Methodology | — | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 269 |
| pages/prudential/FinancialGroupProfile | Record exposure | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 300 |
| pages/prudential/FinancialGroupProfile | Edit | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 344 |
| pages/prudential/FinancialGroupProfile | } > Remove | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 441 |
| pages/prudential/FinancialGroupProfile | Cancel | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 449 |
| pages/prudential/FinancialGroupProfile | Save | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 450 |
| pages/prudential/FinancialGroupProfile | Cancel | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 538 |
| pages/prudential/FinancialGroupProfile | Save | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 539 |
| pages/prudential/FinancialGroupProfile | Cancel | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 624 |
| pages/prudential/FinancialGroupProfile | Save | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 625 |
| pages/prudential/FinancialGroupProfile | Cancel | prudential_supervision.edit | Yes | src/pages/prudential/FinancialGroupProfile.tsx | 696 |
| pages/prudential/FinancialGroupsList | New group | prudential_supervision.create | Yes | src/pages/prudential/FinancialGroupsList.tsx | 43 |
| pages/prudential/PaymentOperatorProfile | Oversight | prudential_supervision.edit | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 62 |
| pages/prudential/PaymentOperatorProfile | Edit | prudential_supervision.edit | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 80 |
| pages/prudential/PaymentOperatorProfile | Start PFMI assessment | prudential_supervision.create | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 83 |
| pages/prudential/PaymentOperatorProfile | Open | — | Yes | src/pages/prudential/PaymentOperatorProfile.tsx | 158 |
| pages/prudential/PfmiAssessmentWizard | Back to oversight | — | Yes | src/pages/prudential/PfmiAssessmentWizard.tsx | 98 |
| pages/prudential/PfmiAssessmentWizard | Previous | prudential_supervision.edit | Yes | src/pages/prudential/PfmiAssessmentWizard.tsx | 196 |
| pages/prudential/PfmiAssessmentWizard | Save &amp; next | prudential_supervision.edit | Yes | src/pages/prudential/PfmiAssessmentWizard.tsx | 200 |
| pages/prudential/PrudentialDashboard | Open work queue | — | Yes | src/pages/prudential/PrudentialDashboard.tsx | 61 |
| pages/prudential/PrudentialEntityProfile | Back to Entities | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 287 |
| pages/prudential/PrudentialEntityProfile | Open Entity 360 | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 304 |
| pages/prudential/PrudentialEntityProfile | Open work queue | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 307 |
| pages/prudential/PrudentialEntityProfile | Export | prudential_supervision.export | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 310 |
| pages/prudential/PrudentialEntityProfile | History | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 311 |
| pages/prudential/PrudentialEntityProfile | Evaluate stress | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 478 |
| pages/prudential/PrudentialEntityProfile | All | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 576 |
| pages/prudential/PrudentialEntityProfile | None | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 577 |
| pages/prudential/PrudentialEntityProfile | Create action | prudential_supervision.create | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 717 |
| pages/prudential/PrudentialEntityProfile | Escalate | prudential_supervision.edit | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 723 |
| pages/prudential/PrudentialEntityProfile | Open return | — | Yes | src/pages/prudential/PrudentialEntityProfile.tsx | 964 |
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
| pages/public/ApplicantGuidance | Start New Application | — | Yes | src/pages/public/ApplicantGuidance.tsx | 42 |
| pages/public/ApplicantGuidance | Licensee Services | — | Yes | src/pages/public/ApplicantGuidance.tsx | 44 |
| pages/public/ApplicantGuidance | View Licensee Services | — | Yes | src/pages/public/ApplicantGuidance.tsx | 78 |
| pages/public/ApplicantGuidance | Connect to Existing Entity | — | Yes | src/pages/public/ApplicantGuidance.tsx | 79 |
| pages/public/ApplicantGuidance | Guidance | — | Yes | src/pages/public/ApplicantGuidance.tsx | 90 |
| pages/public/ApplicantGuidance | Help / Contact | — | Yes | src/pages/public/ApplicantGuidance.tsx | 91 |
| pages/public/DeclarationLanding | Verify Identity | — | Yes | src/pages/public/DeclarationLanding.tsx | 255 |
| pages/public/LicenseeServiceDetail | Regulatory guidance | — | Yes | src/pages/public/LicenseeServiceDetail.tsx | 136 |
| pages/public/LicenseeServiceDetail | Help / Contact | — | Yes | src/pages/public/LicenseeServiceDetail.tsx | 137 |
| pages/public/LicenseeServiceDetail | Connect to Existing Entity | — | Yes | src/pages/public/LicenseeServiceDetail.tsx | 138 |
| pages/public/LicenseeServices | Connect to an Existing Entity | — | Yes | src/pages/public/LicenseeServices.tsx | 54 |
| pages/public/LicenseeServices | Start a New Application | — | Yes | src/pages/public/LicenseeServices.tsx | 64 |
| pages/public/LicenseeServices | View process | — | Yes | src/pages/public/LicenseeServices.tsx | 107 |
| pages/public/LicenseeServices | Guidance | — | Yes | src/pages/public/LicenseeServices.tsx | 149 |
| pages/public/LicenseeServices | Help / Contact | — | Yes | src/pages/public/LicenseeServices.tsx | 150 |
| pages/public/PublicComplaintIntake | Already made a complaint? Track it here | — | Yes | src/pages/public/PublicComplaintIntake.tsx | 50 |
| pages/public/PublicEnforcement | Previous | — | Yes | src/pages/public/PublicEnforcement.tsx | 83 |
| pages/public/PublicEnforcement | Next | — | Yes | src/pages/public/PublicEnforcement.tsx | 84 |
| pages/public/PublicEntityRegister | Search | — | Yes | src/pages/public/PublicEntityRegister.tsx | 51 |
| pages/public/PublicEntityRegister | Previous | — | Yes | src/pages/public/PublicEntityRegister.tsx | 110 |
| pages/public/PublicEntityRegister | Next | — | Yes | src/pages/public/PublicEntityRegister.tsx | 112 |
| pages/public/PublicGuidance | Open | — | Yes | src/pages/public/PublicGuidance.tsx | 61 |
| pages/public/PublicHelp | Licensee Services | — | Yes | src/pages/public/PublicHelp.tsx | 34 |
| pages/public/PublicHelp | Connect to Existing Entity | — | Yes | src/pages/public/PublicHelp.tsx | 63 |
| pages/public/PublicHelp | Start a New Application | — | Yes | src/pages/public/PublicHelp.tsx | 64 |
| pages/public/PublicHelp | Forgot password | — | Yes | src/pages/public/PublicHelp.tsx | 76 |
| pages/public/PublicLicenseeDetail | Request / Connect Portal Access | — | Yes | src/pages/public/PublicLicenseeDetail.tsx | 123 |
| pages/public/PublicLicenseeDetail | Licensee services | — | Yes | src/pages/public/PublicLicenseeDetail.tsx | 128 |
| pages/public/PublicLicensees | Search | — | Yes | src/pages/public/PublicLicensees.tsx | 61 |
| pages/public/PublicLicensees | Previous | — | Yes | src/pages/public/PublicLicensees.tsx | 101 |
| pages/public/PublicLicensees | Next | — | Yes | src/pages/public/PublicLicensees.tsx | 102 |
| pages/PublicComplaintTracking | Make a new complaint | — | Yes | src/pages/PublicComplaintTracking.tsx | 48 |
| pages/registration/AuthorityPendingPage | Sign in | — | Yes | src/pages/registration/AuthorityPendingPage.tsx | 69 |
| pages/registration/AuthorityPendingPage | Registration options | — | Yes | src/pages/registration/AuthorityPendingPage.tsx | 70 |
| pages/registration/EntityIdentification | Create an account | — | Yes | src/pages/registration/EntityIdentification.tsx | 114 |
| pages/registration/EntityIdentification | Sign in | — | Yes | src/pages/registration/EntityIdentification.tsx | 117 |
| pages/registration/EntityIdentification | Identify entity | — | Yes | src/pages/registration/EntityIdentification.tsx | 248 |
| pages/registration/EntityIdentification | Request access to this entity | — | Yes | src/pages/registration/EntityIdentification.tsx | 298 |
| pages/registration/EntityIdentification | Create provisional entity and request access | — | Yes | src/pages/registration/EntityIdentification.tsx | 306 |
| pages/registration/EntityIdentification | Change details | — | Yes | src/pages/registration/EntityIdentification.tsx | 321 |
| pages/registration/PreLicenseeRegistration | Try again | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1376 |
| pages/registration/PreLicenseeRegistration | Try again | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1401 |
| pages/registration/PreLicenseeRegistration | Back to Home | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1422 |
| pages/registration/PreLicenseeRegistration | Refresh | — | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1423 |
| pages/registration/PreLicenseeRegistration | Previous | registration_management.create | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1517 |
| pages/registration/PreLicenseeRegistration | {submitting ? ( Submitting... ) : ( )} | registration_management.create | Yes | src/pages/registration/PreLicenseeRegistration.tsx | 1536 |
| pages/registration/RegistrationJourneyChoice | Try again | — | Yes | src/pages/registration/RegistrationJourneyChoice.tsx | 91 |
| pages/registration/RegistrationJourneyChoice | Sign in | — | Yes | src/pages/registration/RegistrationJourneyChoice.tsx | 94 |
| pages/registration/RegistrationJourneyChoice | {JOURNEY_CTA[j.key] ?? `Continue — $ `} | — | Yes | src/pages/registration/RegistrationJourneyChoice.tsx | 147 |
| pages/registration/RegistrationPortal | Sign Out | — | Yes | src/pages/registration/RegistrationPortal.tsx | 259 |
| pages/registration/RegistrationStatusPage | Update & Resubmit Registration | registration_management.edit | Yes | src/pages/registration/RegistrationStatusPage.tsx | 80 |
| pages/registration/RegistrationStatusPage | Continue Verification | registration_management.edit | Yes | src/pages/registration/RegistrationStatusPage.tsx | 90 |
| pages/registration/RegistrationStatusPage | Go to Dashboard | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 97 |
| pages/registration/RegistrationStatusPage | Refresh | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 103 |
| pages/registration/RegistrationStatusPage | Sign Out | — | Yes | src/pages/registration/RegistrationStatusPage.tsx | 106 |
| pages/registration/UserAccountStep | Send verification code | — | Yes | src/pages/registration/UserAccountStep.tsx | 188 |
| pages/registration/UserAccountStep | Resend code | — | Yes | src/pages/registration/UserAccountStep.tsx | 207 |
| pages/registration/UserAccountStep | Create account and continue | — | Yes | src/pages/registration/UserAccountStep.tsx | 224 |
| pages/reports/components/AdHocReportBuilder | ( ) | report_management.create | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 277 |
| pages/reports/components/AdHocReportBuilder | Reset | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 332 |
| pages/reports/components/AdHocReportBuilder | Save Template | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 336 |
| pages/reports/components/AdHocReportBuilder | Load | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 363 |
| pages/reports/components/AdHocReportBuilder | Save | report_management.view | Yes | src/pages/reports/components/AdHocReportBuilder.tsx | 386 |
| pages/reports/components/ReportHistory | View | report_management.create | Yes | src/pages/reports/components/ReportHistory.tsx | 168 |
| pages/reports/components/ReportHistory | Re-run | report_management.create | Yes | src/pages/reports/components/ReportHistory.tsx | 178 |
| pages/reports/components/ReportLibrary | Favorites | report_management.create | Yes | src/pages/reports/components/ReportLibrary.tsx | 112 |
| pages/reports/components/ReportLibrary | Schedule | report_management.create | Yes | src/pages/reports/components/ReportLibrary.tsx | 146 |
| pages/reports/components/ReportPreviewDialog | PDF | report_management.view | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 188 |
| pages/reports/components/ReportPreviewDialog | Print | report_management.view | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 200 |
| pages/reports/components/ReportPreviewDialog | Prev | report_management.create | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 242 |
| pages/reports/components/ReportPreviewDialog | Next | — | Yes | src/pages/reports/components/ReportPreviewDialog.tsx | 243 |
| pages/reports/ReportPage | Generate Report | report_management.view | Yes | src/pages/reports/ReportPage.tsx | 76 |
| pages/reports/ReportPage | Apply Filters | — | Yes | src/pages/reports/ReportPage.tsx | 108 |
| pages/reports/ReportsDashboard | Schedule Report | report_management.create | Yes | src/pages/reports/ReportsDashboard.tsx | 41 |
| pages/reports/ReportsDashboard | New Report | report_management.create | Yes | src/pages/reports/ReportsDashboard.tsx | 44 |
| pages/ResetPassword | Request New Link | — | Yes | src/pages/ResetPassword.tsx | 118 |
| pages/ResetPassword | Back to Sign In | — | Yes | src/pages/ResetPassword.tsx | 121 |
| pages/ResetPassword | Sign In | — | Yes | src/pages/ResetPassword.tsx | 195 |
| pages/returns-canonical/EntityObligationsWorkbench | Re-derive obligations | returns_management.edit | Yes | src/pages/returns-canonical/EntityObligationsWorkbench.tsx | 60 |
| pages/returns-canonical/EntityObligationsWorkbench | Generate | returns_management.edit | Yes | src/pages/returns-canonical/EntityObligationsWorkbench.tsx | 112 |
| pages/returns-canonical/EntityPicker | Change entity | — | Yes | src/pages/returns-canonical/EntityPicker.tsx | 35 |
| pages/returns-canonical/EntityReportingCalendar | Open | returns_management.edit | Yes | src/pages/returns-canonical/EntityReportingCalendar.tsx | 97 |
| pages/returns-canonical/EntityReportingCalendar | Start filing | returns_management.edit | Yes | src/pages/returns-canonical/EntityReportingCalendar.tsx | 99 |
| pages/returns-canonical/FilingDetail | runAction( )} > Assign | returns_management.workflow_action | Yes | src/pages/returns-canonical/FilingDetail.tsx | 155 |
| pages/returns-canonical/FilingDetail | Submit response | returns_management.submit | Yes | src/pages/returns-canonical/FilingDetail.tsx | 474 |
| pages/returns-canonical/RegulatoryMetricsAdmin | New metric | returns_management.create | Yes | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 75 |
| pages/returns-canonical/RegulatoryMetricsAdmin | Cancel | returns_management.edit | Yes | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 198 |
| pages/returns-canonical/RegulatoryMetricsAdmin | Save metric | returns_management.edit | Yes | src/pages/returns-canonical/RegulatoryMetricsAdmin.tsx | 199 |
| pages/returns-mgmt/ManageRules | Add Rule | returns_management.manage_config | Yes | src/pages/returns-mgmt/ManageRules.tsx | 45 |
| pages/returns-mgmt/ManageScheduling | New Schedule | returns_management.manage_config | Yes | src/pages/returns-mgmt/ManageScheduling.tsx | 48 |
| pages/returns-mgmt/ManageStructures | New Structure | returns_management.manage_config | Yes | src/pages/returns-mgmt/ManageStructures.tsx | 45 |
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
| pages/returns-mgmt/ReturnDetail | Request Edit | returns_management.workflow_action | Yes | src/pages/returns-mgmt/ReturnDetail.tsx | 878 |
| pages/returns-mgmt/ReturnGroups | Create Group | returns_management.manage_config | Yes | src/pages/returns-mgmt/ReturnGroups.tsx | 45 |
| pages/returns-mgmt/ViewReturns | Clear filter | — | Yes | src/pages/returns-mgmt/ViewReturns.tsx | 258 |
| pages/returns-mgmt/ViewReturns | Export | returns_management.export | Yes | src/pages/returns-mgmt/ViewReturns.tsx | 286 |
| pages/Returns | View Calendar | — | Yes | src/pages/Returns.tsx | 144 |
| pages/Returns | View Overdue | — | Yes | src/pages/Returns.tsx | 189 |
| pages/Returns | Filters | — | Yes | src/pages/Returns.tsx | 217 |
| pages/settings/ApplicationFormSettings | Send | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 136 |
| pages/settings/ApplicationFormSettings | Back | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 170 |
| pages/settings/ApplicationFormSettings | Save Changes | settings.edit | Yes | src/pages/settings/ApplicationFormSettings.tsx | 173 |
| pages/settings/BrandingSettings | Back | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 119 |
| pages/settings/BrandingSettings | Save Changes | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 120 |
| pages/settings/BrandingSettings | Upload | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 164 |
| pages/settings/BrandingSettings | Upload | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 194 |
| pages/settings/BrandingSettings | Add Link | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 223 |
| pages/settings/BrandingSettings | Add Link | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 272 |
| pages/settings/BrandingSettings | Add Social | settings.edit | Yes | src/pages/settings/BrandingSettings.tsx | 298 |
| pages/settings/CaptchaSettings | Add configuration | settings.edit | Yes | src/pages/settings/CaptchaSettings.tsx | 265 |
| pages/settings/CaptchaSettings | activate(config.id)}> Activate | settings.edit | Yes | src/pages/settings/CaptchaSettings.tsx | 312 |
| pages/settings/CaptchaSettings | Edit | settings.edit | Yes | src/pages/settings/CaptchaSettings.tsx | 316 |
| pages/settings/CaptchaSettings | Cancel | settings.edit | Yes | src/pages/settings/CaptchaSettings.tsx | 447 |
| pages/settings/CaptchaSettings | Save | settings.edit | Yes | src/pages/settings/CaptchaSettings.tsx | 448 |
| pages/settings/CertificateSignatorySettings | Back | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 212 |
| pages/settings/CertificateSignatorySettings | Save Changes | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 215 |
| pages/settings/CertificateSignatorySettings | Remove | settings.edit | Yes | src/pages/settings/CertificateSignatorySettings.tsx | 344 |
| pages/settings/CurrencySettings | Approve | fee_management.edit | Yes | src/pages/settings/CurrencySettings.tsx | 323 |
| pages/settings/CurrencySettings | Reject | fee_management.edit | Yes | src/pages/settings/CurrencySettings.tsx | 324 |
| pages/settings/CurrencySettings | Supersede | fee_management.edit | Yes | src/pages/settings/CurrencySettings.tsx | 328 |
| pages/settings/DataManagementSettings | Back | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 25 |
| pages/settings/DataManagementSettings | Save Changes | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 26 |
| pages/settings/DataManagementSettings | Export Database | settings.export | Yes | src/pages/settings/DataManagementSettings.tsx | 62 |
| pages/settings/DataManagementSettings | Export Audit Logs | settings.export | Yes | src/pages/settings/DataManagementSettings.tsx | 74 |
| pages/settings/DataManagementSettings | Purge | settings.edit | Yes | src/pages/settings/DataManagementSettings.tsx | 121 |
| pages/settings/EmailSmsSettings | Back | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 214 |
| pages/settings/EmailSmsSettings | Save Changes | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 217 |
| pages/settings/EmailSmsSettings | Send Test via Resend | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 342 |
| pages/settings/EmailSmsSettings | Send Test Email | settings.edit | Yes | src/pages/settings/EmailSmsSettings.tsx | 460 |
| pages/settings/GeneralSettings | Back | settings.edit | Yes | src/pages/settings/GeneralSettings.tsx | 51 |
| pages/settings/GeneralSettings | Save Changes | settings.edit | Yes | src/pages/settings/GeneralSettings.tsx | 52 |
| pages/settings/IntegrationSettings | Back | — | Yes | src/pages/settings/IntegrationSettings.tsx | 259 |
| pages/settings/IntegrationSettings | Refresh | — | Yes | src/pages/settings/IntegrationSettings.tsx | 262 |
| pages/settings/IntegrationSettings | Test | — | Yes | src/pages/settings/IntegrationSettings.tsx | 353 |
| pages/settings/IntegrationSettings | Configure | — | Yes | src/pages/settings/IntegrationSettings.tsx | 359 |
| pages/settings/IntegrationSettings | Save threshold | — | Yes | src/pages/settings/IntegrationSettings.tsx | 483 |
| pages/settings/IntegrationSettings | Cancel | settings.edit | Yes | src/pages/settings/IntegrationSettings.tsx | 600 |
| pages/settings/IntegrationSettings | Save | settings.edit | Yes | src/pages/settings/IntegrationSettings.tsx | 601 |
| pages/settings/IntegrationSettings | Cancel | settings.edit | Yes | src/pages/settings/IntegrationSettings.tsx | 665 |
| pages/settings/IntegrationSettings | Rotate | settings.edit | Yes | src/pages/settings/IntegrationSettings.tsx | 666 |
| pages/settings/IntegrationSettings | Cancel | — | Yes | src/pages/settings/IntegrationSettings.tsx | 725 |
| pages/settings/LicenseExpirySettings | Back | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 262 |
| pages/settings/LicenseExpirySettings | Add Rule | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 265 |
| pages/settings/LicenseExpirySettings | Add your first rule | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 287 |
| pages/settings/LicenseExpirySettings | View | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 324 |
| pages/settings/LicenseExpirySettings | Edit | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 327 |
| pages/settings/LicenseExpirySettings | Save Rule | settings.edit | Yes | src/pages/settings/LicenseExpirySettings.tsx | 443 |
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
| pages/supervision/aml/AmlAssessments | Open | — | Yes | src/pages/supervision/aml/AmlAssessments.tsx | 151 |
| pages/supervision/aml/AmlAssessmentWorkspace | Back to AML/CFT assessments | — | Yes | src/pages/supervision/aml/AmlAssessmentWorkspace.tsx | 140 |
| pages/supervision/aml/AmlExaminations | Open only | — | Yes | src/pages/supervision/aml/AmlExaminations.tsx | 116 |
| pages/supervision/aml/AmlExaminations | Open | — | Yes | src/pages/supervision/aml/AmlExaminations.tsx | 235 |
| pages/supervision/aml/AmlFindings | Assessment | — | Yes | src/pages/supervision/aml/AmlFindings.tsx | 139 |
| pages/supervision/aml/AmlFindings | Open finding | — | Yes | src/pages/supervision/aml/AmlFindings.tsx | 143 |
| pages/supervision/aml/AmlOverview | Open | — | Yes | src/pages/supervision/aml/AmlOverview.tsx | 92 |
| pages/supervision/aml/AmlOverview | My work queue | — | Yes | src/pages/supervision/aml/AmlOverview.tsx | 114 |
| pages/supervision/aml/AmlOverview | Assessments | — | Yes | src/pages/supervision/aml/AmlOverview.tsx | 117 |
| pages/supervision/aml/AmlOverview | View all | — | Yes | src/pages/supervision/aml/AmlOverview.tsx | 141 |
| pages/supervision/aml/AmlSupervisedEntities | Assessment | — | Yes | src/pages/supervision/aml/AmlSupervisedEntities.tsx | 185 |
| pages/supervision/aml/AmlWorkQueue | {counts[s] != null ? ( ) : null} | — | Yes | src/pages/supervision/aml/AmlWorkQueue.tsx | 82 |
| pages/supervision/aml/AmlWorkQueue | Open | — | Yes | src/pages/supervision/aml/AmlWorkQueue.tsx | 187 |
| pages/supervision/BreachInbox | Ack | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 324 |
| pages/supervision/BreachInbox | Escalate | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 327 |
| pages/supervision/BreachInbox | Cancel | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 363 |
| pages/supervision/BreachInbox | Acknowledge | prudential_supervision.edit | Yes | src/pages/supervision/BreachInbox.tsx | 364 |
| pages/supervision/BreachInbox | Cancel | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 424 |
| pages/supervision/BreachInbox | Create enforcement case | prudential_supervision.initiate_supervisory_action | Yes | src/pages/supervision/BreachInbox.tsx | 425 |
| pages/supervision/FindingWorkspace | Findings register | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 111 |
| pages/supervision/FindingWorkspace | Record response | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 232 |
| pages/supervision/FindingWorkspace | Add corrective action | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 291 |
| pages/supervision/FindingWorkspace | Cancel | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 451 |
| pages/supervision/FindingWorkspace | Record response | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 452 |
| pages/supervision/FindingWorkspace | Cancel | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 512 |
| pages/supervision/FindingWorkspace | Raise corrective action | — | Yes | src/pages/supervision/FindingWorkspace.tsx | 513 |
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
| pages/supervision/SupervisoryPortfolio | Refresh | — | Yes | src/pages/supervision/SupervisoryPortfolio.tsx | 260 |
| pages/supervision/SupervisoryPortfolio | Clear filters | — | Yes | src/pages/supervision/SupervisoryPortfolio.tsx | 263 |
| pages/supervision/ThematicClosureQueue | Review report | — | Yes | src/pages/supervision/ThematicClosureQueue.tsx | 49 |
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
