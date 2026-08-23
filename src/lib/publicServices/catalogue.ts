/**
 * Public licensee service catalogue.
 *
 * Single source of truth for the logged-out "For Licensees" hub, the service
 * process pages and the homepage "Already regulated?" section.
 *
 * IMPORTANT: every entry here is classified against the ACTUAL implemented
 * routes of this application. Services classified as `NOT_IMPLEMENTED` are
 * never rendered publicly — they exist in this file only so the gap register
 * (docs/product/LICENSEE_SERVICE_GAP_REGISTER.md) stays traceable.
 */

export type ServiceStatus =
  | 'AVAILABLE'
  | 'AVAILABLE_WITH_LIMITATIONS'
  | 'REGULATOR_INITIATED_ONLY'
  | 'NOT_IMPLEMENTED';

export type ServiceAudience =
  | 'Applicant'
  | 'Primary entity representative'
  | 'Authorised entity user'
  | 'Member of the public';

export type InitiatingParty = 'Entity' | 'Regulator' | 'Either';

export interface PublicService {
  slug: string;
  name: string;
  group: string;
  /** Short description used on catalogue cards. */
  summary: string;
  /** "About this service" block. */
  about: string;
  audience: ServiceAudience[];
  beforeYouStart: string[];
  process: string[];
  afterYouSubmit: string[];
  status: ServiceStatus;
  initiatedBy: InitiatingParty;
  /** Authenticated destination the sign-in CTA resolves to (relative path). */
  authenticatedRoute: string | null;
  /** Label for the primary call to action. */
  ctaLabel: string;
  /** When set, the CTA is a public route (no sign-in required). */
  publicCta?: { label: string; href: string };
  /** Capability / authority note shown publicly. */
  authorityNote?: string;
  /** Internal-only note captured in the gap register. */
  gap?: string;
}

/** Builds a safe, relative sign-in redirect. Never accepts absolute URLs. */
export function signInHref(target?: string | null): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/login';
  return `/login?redirect=${encodeURIComponent(target)}`;
}

export const SERVICE_GROUPS = [
  'Licensing & Authorisation',
  'Licence Management',
  'Regulatory Reporting',
  'People & Fit and Proper',
  'Supervisory Engagement',
  'Portal Access',
] as const;

export const PUBLIC_SERVICES: PublicService[] = [
  {
    slug: 'new-licence',
    name: 'New Licence / Authorisation',
    group: 'Licensing & Authorisation',
    summary: 'Apply for a new regulatory licence or authorisation.',
    about:
      'Apply for a new regulatory licence or authorisation. The application form, required information and supporting evidence are determined by the licence type and sector you select.',
    audience: ['Applicant', 'Primary entity representative'],
    beforeYouStart: [
      'Create a portal account and verify your email address.',
      'Have your organisation’s legal and registration details available.',
      'Identify the sector, sub-sector and licence type you are applying for.',
      'Prepare the supporting documents listed in the application form — the exact list is configured per licence type and is shown to you before submission.',
      'Confirm who in your organisation is authorised to make the final submission.',
    ],
    process: [
      'Create an account and verify your email address.',
      'Provide organisation and contact information.',
      'Select the sector and licence type you require.',
      'Complete each required form section and upload the requested evidence.',
      'Complete declarations and pay any applicable fee.',
      'Submit the application for regulatory review.',
    ],
    afterYouSubmit: [
      'You receive an acknowledgement and a reference you can track in the portal.',
      'The regulator may issue requests for further information or documents.',
      'The application is assessed and routed through the configured approval workflow.',
      'A decision is issued to your portal account and by correspondence.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Entity',
    authenticatedRoute: '/applications',
    ctaLabel: 'Sign In to Continue Application',
    publicCta: { label: 'Start Application', href: '/register/applicant' },
    authorityNote:
      'Draft preparation may be delegated to authorised users. Final submission requires a user with submission authority.',
  },
  {
    slug: 'licence-renewal',
    name: 'Renew a Licence',
    group: 'Licence Management',
    summary: 'Submit a renewal request for an existing licence where renewal is applicable.',
    about:
      'Submit a renewal request for an existing licence where renewal is applicable. Renewal availability, forms and fees depend on the licence type configured by the regulator.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Your organisation must already hold a licence recorded in the portal.',
      'You need portal access linked to that entity.',
      'Renewal must be configured as an available post-licence service for your licence type.',
    ],
    process: [
      'Sign in to the entity portal.',
      'Select the licence you wish to renew.',
      'Review the renewal requirements presented for that licence.',
      'Provide the requested information and documents.',
      'Submit the renewal request.',
      'Regulatory review.',
      'Decision.',
    ],
    afterYouSubmit: [
      'The regulator reviews the renewal request and may request further information.',
      'A renewal decision is recorded against the licence and issued to your portal account.',
    ],
    status: 'AVAILABLE_WITH_LIMITATIONS',
    initiatedBy: 'Entity',
    authenticatedRoute: '/post-license/new',
    ctaLabel: 'Sign In to Renew',
    authorityNote:
      'Renewal requests are visible to authorised entity users; submission depends on the authority configured for your portal role.',
    gap: 'Renewal is delivered through the generic post-licence application journey and depends on the regulator configuring a renewal service and published form for each licence type. There is no dedicated renewal wizard or automatic renewal window pre-fill.',
  },
  {
    slug: 'licence-variation',
    name: 'Request a Licence Variation',
    group: 'Licence Management',
    summary: 'Request approval for a change to an existing licence or its conditions.',
    about:
      'Some changes to a regulated business require regulatory approval before they take effect — for example changes to permitted activities, ownership or control, key officers, business address or operating model. A variation request lets you submit the change and supporting evidence for assessment.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Identify the licence affected by the change.',
      'Confirm the change requires approval rather than notification only.',
      'Prepare evidence supporting the change.',
    ],
    process: [
      'Sign in to the entity portal.',
      'Select the licence to be varied.',
      'Choose the variation type available for your licence.',
      'Provide details and supporting evidence.',
      'Submit the request.',
      'Regulatory review.',
      'Decision.',
    ],
    afterYouSubmit: [
      'The regulator assesses the request and may request further information.',
      'A decision is issued to your portal account and recorded against the licence.',
    ],
    status: 'AVAILABLE_WITH_LIMITATIONS',
    initiatedBy: 'Entity',
    authenticatedRoute: '/post-license/new',
    ctaLabel: 'Sign In to Request Variation',
    gap: 'Variation types are driven by configured post-licence services and published forms. Variation-specific validation (for example control-change thresholds) is not modelled separately from the generic application journey.',
  },
  {
    slug: 'licence-surrender',
    name: 'Surrender / Cancellation Request',
    group: 'Licence Management',
    summary: 'Request the surrender or cancellation of a licence you no longer require.',
    about:
      'Where your organisation no longer intends to carry out the licensed activity, you may request surrender or cancellation of the licence. Submitting a request does not automatically terminate the licence — the licence remains in force, with all associated obligations, until the regulator issues a decision.',
    audience: ['Primary entity representative'],
    beforeYouStart: [
      'Identify the licence concerned.',
      'Be prepared to explain the reason and proposed effective date.',
      'Outstanding returns, fees and obligations may need to be resolved before a decision.',
    ],
    process: [
      'Sign in to the entity portal.',
      'Select the licence concerned.',
      'Choose the surrender / cancellation service.',
      'Provide reasons, proposed date and supporting information.',
      'Submit the request.',
      'Regulatory review.',
      'Decision.',
    ],
    afterYouSubmit: [
      'The regulator reviews the request and any outstanding obligations.',
      'Your obligations continue until a decision is issued.',
      'The decision and any effective date are recorded against the licence.',
    ],
    status: 'AVAILABLE_WITH_LIMITATIONS',
    initiatedBy: 'Entity',
    authenticatedRoute: '/post-license/new',
    ctaLabel: 'Sign In',
    authorityNote:
      'Suspension and revocation are regulatory powers exercised by the regulator and cannot be initiated by an entity.',
    gap: 'Surrender is submitted through the generic post-licence application journey; there is no dedicated surrender checklist that automatically validates outstanding returns, fees or obligations.',
  },
  {
    slug: 'regulatory-returns',
    name: 'Regulatory Returns',
    group: 'Regulatory Reporting',
    summary: 'View reporting obligations, prepare, validate and submit regulatory returns.',
    about:
      'Regulated entities file periodic regulatory returns through the secure entity portal. Signed-in users can view their reporting obligations and due dates, prepare returns, save drafts, validate submissions before filing, submit authorised returns, respond to correction or resubmission requirements, and view filing history.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Portal access linked to your regulated entity.',
      'The reporting obligations applicable to your licence and sector — these are configured by the regulator and shown in the portal.',
      'The financial or operational data required by each return.',
    ],
    process: [
      'Sign in to the entity portal.',
      'Open your reporting obligations and due dates.',
      'Select the return period to prepare.',
      'Enter or import the required data and save drafts as you work.',
      'Validate the return and resolve any reported errors.',
      'Submit the return for regulatory review.',
      'Respond to any correction or resubmission request.',
    ],
    afterYouSubmit: [
      'The submission is acknowledged and recorded in your filing history.',
      'The regulator reviews the return and may request corrections or a resubmission.',
      'Late or outstanding filings may attract configured late fees or supervisory follow-up.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Entity',
    authenticatedRoute: '/entity/returns',
    ctaLabel: 'Sign In to Regulatory Returns',
    authorityNote:
      'Authorised preparers may prepare returns. Final submission is restricted to users with appropriate authority.',
  },
  {
    slug: 'regulatory-deadlines',
    name: 'Regulatory Deadlines',
    group: 'Regulatory Reporting',
    summary: 'Track the regulatory deadlines that apply to your organisation.',
    about:
      'Signed-in users can see the regulatory deadlines that apply to their organisation, derived from actual configuration and business records. Depending on what the regulator has configured for your entity these may include return due dates, information requests, licence renewal dates, remediation deadlines and other regulatory obligations.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: ['Portal access linked to your regulated entity.'],
    process: [
      'Sign in to the entity portal.',
      'Open your reporting and obligations view.',
      'Review upcoming and overdue items.',
      'Open an item to prepare the required submission or response.',
    ],
    afterYouSubmit: [
      'Completed obligations are recorded against your entity.',
      'Outstanding items remain visible until they are closed.',
    ],
    status: 'AVAILABLE_WITH_LIMITATIONS',
    initiatedBy: 'Either',
    authenticatedRoute: '/entity/returns/dashboard',
    ctaLabel: 'Sign In to View Deadlines',
    gap: 'Deadlines are surfaced per module (returns dashboard, requests, correspondence). There is no single consolidated entity deadline calendar aggregating returns, RFIs, renewals and remediation in one view.',
  },
  {
    slug: 'fit-and-proper',
    name: 'Fit & Proper Submissions',
    group: 'People & Fit and Proper',
    summary: 'Provide information about directors, controllers and key function holders.',
    about:
      'Regulated entities may be required to submit information about directors, controllers, senior management, key function holders and other regulated persons. You provide the required personal, professional and supporting information for regulatory assessment. Assessment outcomes are communicated to the entity where they are publishable to you; internal assessment and risk findings are not disclosed.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Identify the individuals covered by the requirement.',
      'Obtain each individual’s consent to provide their information.',
      'Prepare the supporting evidence requested in the assessment form — the exact list is configured by the regulator.',
    ],
    process: [
      'Sign in to the entity portal.',
      'Open the person or requirement referred to you.',
      'Complete the required information.',
      'Upload the requested evidence.',
      'Submit the information.',
      'Respond to any further requests.',
      'View the outcome where it is publishable to the entity.',
    ],
    afterYouSubmit: [
      'The regulator carries out its assessment.',
      'Further information may be requested from the entity or the individual.',
      'The entity is notified of the outcome where it is publishable.',
    ],
    status: 'REGULATOR_INITIATED_ONLY',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/correspondence',
    ctaLabel: 'Sign In to Manage Fit & Proper',
    authorityNote:
      'Fit and proper requirements are raised by the regulator or as part of an application. Individuals may also be invited to complete a declaration directly through a secure personal link.',
    gap: 'There is no self-service entity workspace listing all fit and proper requirements for an organisation. Individual declarations are collected through secure invitation links, and entity-facing requests arrive via correspondence and the application journey.',
  },
  {
    slug: 'regulatory-requests',
    name: 'Respond to Regulatory Requests',
    group: 'Supervisory Engagement',
    summary: 'Review and respond to requests for information, documents and remediation evidence.',
    about:
      'The regulator may request additional information, documents, explanations, remediation evidence or a response to findings. Authorised entity users can open each request, see the response deadline, prepare the response, attach evidence, submit it and track its status. Internal regulator notes and assessment reasoning remain private.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Portal access linked to your regulated entity.',
      'The reference from the notification you received.',
      'The information or evidence being requested.',
    ],
    process: [
      'You receive a notification that a request has been issued.',
      'Sign in to the entity portal.',
      'Open the request.',
      'Review what is required and the response deadline.',
      'Prepare your response.',
      'Attach the supporting evidence.',
      'Submit the response and track its status.',
    ],
    afterYouSubmit: [
      'The response is recorded against the request and reviewed by the regulator.',
      'Further clarification may be requested.',
      'The request is closed once the regulator is satisfied.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/supervisory-actions',
    ctaLabel: 'Sign In to View Requests',
  },
  {
    slug: 'correspondence',
    name: 'Regulatory Correspondence',
    group: 'Supervisory Engagement',
    summary: 'Access official correspondence issued to your entity.',
    about:
      'Authorised users can access official correspondence associated with their entity — for example application correspondence, information requests, supervisory notices, decisions, reminders and other entity-facing communications. Correspondence is never exposed publicly and is only available to authorised users of the entity concerned.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: ['Portal access linked to your regulated entity.'],
    process: [
      'Sign in to the entity portal.',
      'Open your correspondence inbox.',
      'Read the correspondence and any attachments.',
      'Respond where a response is requested.',
    ],
    afterYouSubmit: [
      'Your reply is recorded on the correspondence thread.',
      'The regulator may continue the thread or close it.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/correspondence',
    ctaLabel: 'Sign In to Correspondence',
  },
  {
    slug: 'conduct-response',
    name: 'Respond to Regulatory Matters',
    group: 'Supervisory Engagement',
    summary: 'Respond to a regulator request concerning a complaint or conduct matter.',
    about:
      'Where the regulator requests a response regarding a complaint, conduct matter or investigation, authorised entity users can securely review the request and submit the required response or evidence. Complainant information that is not intended for the entity, regulator internal notes, investigative reasoning and confidential findings are never disclosed.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Portal access linked to your regulated entity.',
      'The reference provided in the request.',
      'Your internal records relevant to the matter.',
    ],
    process: [
      'You receive a notification that a response is required.',
      'Sign in to the entity portal.',
      'Open the request and review the response deadline.',
      'Prepare your response and attach evidence.',
      'Submit the response.',
      'Track the status of the matter as it progresses.',
    ],
    afterYouSubmit: [
      'The regulator reviews your response.',
      'Further information may be requested.',
      'You are notified of any outcome communicated to the entity.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/complaint-rfis',
    ctaLabel: 'Sign In to Respond',
  },
  {
    slug: 'examinations',
    name: 'Examination & Inspection Requests',
    group: 'Supervisory Engagement',
    summary: 'Receive examination notices and submit requested information and evidence.',
    about:
      'Onsite and offsite examinations are initiated by the regulator. Where an examination has entity-facing activities, authorised users receive the official notice and any requests for information through the secure portal, and can submit documents, evidence, responses to findings and remediation evidence. Inspection workpapers, internal scoping, team notes and supervisory assessment are never disclosed to the entity.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Portal access linked to your regulated entity.',
      'The examination reference from the notice you received.',
    ],
    process: [
      'The regulator issues an examination notice to your entity.',
      'Sign in to the entity portal.',
      'Review the notice and any information request.',
      'Submit the requested documents and evidence.',
      'Respond to findings communicated to you.',
      'Submit remediation evidence where required.',
    ],
    afterYouSubmit: [
      'The regulator reviews the information provided.',
      'Findings communicated to the entity may require remediation.',
      'Remediation is tracked to closure.',
    ],
    status: 'REGULATOR_INITIATED_ONLY',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/correspondence',
    ctaLabel: 'Sign In to View Examination Requests',
    gap: 'There is no dedicated entity-facing examination workspace. Examination notices, information requests and finding responses currently reach the entity through correspondence and supervisory action / request surfaces.',
  },
  {
    slug: 'enforcement-notices',
    name: 'Enforcement Notices & Representations',
    group: 'Supervisory Engagement',
    summary: 'Access governed enforcement notices issued to your entity and respond where permitted.',
    about:
      'Published enforcement outcomes are available to anyone in the public enforcement register. Where an enforcement matter concerns your entity, authorised entity representatives can securely access regulatory notices and submit representations or required responses where applicable. Unpublished enforcement cases are never exposed publicly.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Portal access linked to your regulated entity.',
      'The notice reference issued to your entity.',
    ],
    process: [
      'The regulator issues a governed notice to your entity.',
      'Sign in to the entity portal.',
      'Review the notice and the response window.',
      'Prepare your representation or required response.',
      'Submit it with any supporting evidence.',
      'Await the regulatory decision.',
    ],
    afterYouSubmit: [
      'Your representation is recorded against the matter.',
      'The regulator considers it before deciding.',
      'Decisions may be published in the public enforcement register where publication is authorised.',
    ],
    status: 'REGULATOR_INITIATED_ONLY',
    initiatedBy: 'Regulator',
    authenticatedRoute: '/entity/supervisory-actions',
    ctaLabel: 'Sign In',
    publicCta: { label: 'View Published Enforcement', href: '/registry/enforcement' },
    gap: 'Entity-facing enforcement notices are delivered through correspondence and supervisory actions. A dedicated representation submission surface bound to the enforcement case is not implemented.',
  },
  {
    slug: 'portal-access',
    name: 'Portal Access for Your Organisation',
    group: 'Portal Access',
    summary: 'Get access for your organisation and manage additional authorised users.',
    about:
      'Portal access is organisation-specific. A primary or authorised entity representative is responsible for regulated-entity portal administration where applicable, and additional authorised users receive delegated access rights according to the configured authority model. Having access does not automatically give authority to make every submission — final submissions depend on your role and authority.',
    audience: ['Primary entity representative', 'Authorised entity user'],
    beforeYouStart: [
      'Your organisation’s registered legal name and any licence or registration reference.',
      'A verifiable work email address.',
      'Authority to act for the organisation — access requests are verified by the regulator.',
    ],
    process: [
      'Create a portal account and verify your email address.',
      'Identify your organisation using the connect-to-existing-entity journey.',
      'Provide evidence of your authority to act.',
      'The regulator verifies the request.',
      'Access is granted and linked to your organisation.',
      'The primary representative may then request access for additional users.',
    ],
    afterYouSubmit: [
      'The regulator reviews and verifies the access request.',
      'You are notified by email when access is granted or further information is required.',
    ],
    status: 'AVAILABLE',
    initiatedBy: 'Entity',
    authenticatedRoute: '/profile',
    ctaLabel: 'Sign In',
    publicCta: { label: 'Connect to Existing Entity', href: '/register/entity' },
  },
];

/** Publicly rendered services only — never advertise unimplemented capability. */
export const PUBLISHED_SERVICES = PUBLIC_SERVICES.filter((s) => s.status !== 'NOT_IMPLEMENTED');

export function getService(slug?: string) {
  return PUBLISHED_SERVICES.find((s) => s.slug === slug);
}

export function servicesByGroup() {
  return SERVICE_GROUPS.map((group) => ({
    group,
    services: PUBLISHED_SERVICES.filter((s) => s.group === group),
  })).filter((g) => g.services.length > 0);
}

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  AVAILABLE: 'Available',
  AVAILABLE_WITH_LIMITATIONS: 'Available (configuration dependent)',
  REGULATOR_INITIATED_ONLY: 'Initiated by the regulator',
  NOT_IMPLEMENTED: 'Not available',
};
