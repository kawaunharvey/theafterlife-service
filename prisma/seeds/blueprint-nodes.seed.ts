import {
  ActionAssigneeKind,
  ActionPriority,
  Prisma,
  PrismaClient,
  TaxonomyKind,
} from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URI } },
});

type TaxonomySeed = {
  key: string;
  kind: "CATEGORY" | "DTE" | "INTENT" | "TAG";
  name: string;
  description: string | null;
  group: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
};

type ActionSeed = {
  intentKey: string;
  title: string;
  defaultAssignee: "organizer" | "family_member" | "anyone";
  priority: "critical" | "high" | "medium" | "low";
  phaseHint: "0-24h" | "24-72h" | "1-2 weeks" | "ongoing";
  dependsOnIntentKeys: string[];
  taxonomies: string[];
  resourceKind: string | null;
  locale: string;
  isActive: boolean;
};

const taxonomyRows: TaxonomySeed[] = [
  {
    "key": "CAT_ACCOUNTANT",
    "kind": "CATEGORY",
    "name": "Accountant / CPA",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_ATTORNEY",
    "kind": "CATEGORY",
    "name": "Attorney",
    "description": "Legal services for estate and probate",
    "group": "Administrative",
    "metadata": {
      "googlePlaceTypes": [
        "lawyer"
      ],
      "typicalServices": [
        "estate-planning",
        "probate",
        "wills"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_CATERER",
    "kind": "CATEGORY",
    "name": "Caterer",
    "description": "Food service for memorial gatherings",
    "group": "Venues",
    "metadata": {
      "googlePlaceTypes": [
        "meal_delivery",
        "restaurant"
      ],
      "typicalServices": [
        "full-service-catering",
        "delivery",
        "setup"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_CEMETERY",
    "kind": "CATEGORY",
    "name": "Cemetery",
    "description": "Burial grounds and memorial parks",
    "group": "Core Services",
    "metadata": {
      "googlePlaceTypes": [
        "cemetery"
      ],
      "typicalServices": [
        "burial-plots",
        "headstones",
        "maintenance"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_CREMATION_PROVIDER",
    "kind": "CATEGORY",
    "name": "Cremation Provider",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_CREMATORIUM",
    "kind": "CATEGORY",
    "name": "Crematorium",
    "description": "Specialized cremation facilities",
    "group": "Core Services",
    "metadata": {
      "googlePlaceTypes": [
        "funeral_home",
        "crematorium"
      ],
      "typicalServices": [
        "cremation",
        "urn-selection"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_EVENT_VENUE",
    "kind": "CATEGORY",
    "name": "Event Venue",
    "description": "Dedicated event and reception spaces",
    "group": "Venues",
    "metadata": {
      "googlePlaceTypes": [
        "event_venue",
        "banquet_hall"
      ],
      "typicalServices": [
        "event-hosting",
        "catering",
        "av-equipment"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_FINANCIAL_INSTITUTION",
    "kind": "CATEGORY",
    "name": "Bank / Financial Institution",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_FLORIST",
    "kind": "CATEGORY",
    "name": "Florist",
    "description": "Flower arrangements and delivery",
    "group": "Memorial Items",
    "metadata": {
      "googlePlaceTypes": [
        "florist"
      ],
      "typicalServices": [
        "sympathy-flowers",
        "funeral-sprays",
        "delivery"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_FUNERAL_HOME",
    "kind": "CATEGORY",
    "name": "Funeral Home",
    "description": "Full-service funeral and memorial providers",
    "group": "Core Services",
    "metadata": {
      "googlePlaceTypes": [
        "funeral_home"
      ],
      "typicalServices": [
        "cremation",
        "burial",
        "embalming",
        "memorial-service"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_GRIEF_COUNSELOR",
    "kind": "CATEGORY",
    "name": "Grief Counselor",
    "description": "Licensed bereavement counselors",
    "group": "Support",
    "metadata": {
      "googlePlaceTypes": [
        "psychologist",
        "therapist"
      ],
      "typicalServices": [
        "individual-counseling",
        "group-therapy"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_HOME_SECURITY",
    "kind": "CATEGORY",
    "name": "Home Security",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_MOVING_SERVICES",
    "kind": "CATEGORY",
    "name": "Moving Services",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_NEWSPAPER",
    "kind": "CATEGORY",
    "name": "Newspaper / Obituary Publisher",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_PET_SERVICES",
    "kind": "CATEGORY",
    "name": "Pet Services",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "CAT_PHOTOGRAPHER",
    "kind": "CATEGORY",
    "name": "Photographer",
    "description": "Memorial and service photography",
    "group": "Memorial Items",
    "metadata": {
      "googlePlaceTypes": [
        "photographer"
      ],
      "typicalServices": [
        "event-photography",
        "photo-restoration"
      ]
    },
    "isActive": true
  },
  {
    "key": "CAT_RESTAURANT",
    "kind": "CATEGORY",
    "name": "Restaurant",
    "description": "Dining establishments for receptions",
    "group": "Venues",
    "metadata": {
      "googlePlaceTypes": [
        "restaurant"
      ],
      "typicalServices": [
        "private-dining",
        "catering",
        "event-space"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_ALZHEIMERS_DEMENTIA",
    "kind": "DTE",
    "name": "Alzheimer's / Dementia",
    "description": null,
    "group": "Expected",
    "metadata": {
      "urgencyLevel": "urgent",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_SECURE_VACANT_PROPERTY",
        "INTENT_RELOCATION_SUPPORT"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_CANCER_TERMINAL",
    "kind": "DTE",
    "name": "Terminal Cancer",
    "description": null,
    "group": "Expected",
    "metadata": {
      "urgencyLevel": "urgent",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_SECURE_VACANT_PROPERTY",
        "INTENT_RELOCATION_SUPPORT"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_CAR_ACCIDENT",
    "kind": "DTE",
    "name": "Car Accident",
    "description": null,
    "group": "Sudden",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_WRONGFUL_DEATH_CLAIM",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_DEATH_ABROAD",
    "kind": "DTE",
    "name": "Death Outside the U.S.",
    "description": null,
    "group": "Special",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_TRAVEL_BOOKING",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_FILE_FINAL_TAX_RETURN"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_DEATH_OF_MINOR",
    "kind": "DTE",
    "name": "Death of a Child",
    "description": null,
    "group": "Special",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_WRONGFUL_DEATH_CLAIM",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_ARRANGE_PET_CARE"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_DIED_AT_HOME",
    "kind": "DTE",
    "name": "Died at Home",
    "description": null,
    "group": "Special",
    "metadata": {
      "urgencyLevel": "urgent",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE",
        "INTENT_SECURE_VACANT_PROPERTY"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_DIED_IN_HOSPITAL",
    "kind": "DTE",
    "name": "Died in Hospital",
    "description": null,
    "group": "Special",
    "metadata": {
      "urgencyLevel": "urgent",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_DRUG_OVERDOSE",
    "kind": "DTE",
    "name": "Drug Overdose",
    "description": null,
    "group": "Sudden",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_DISPUTE_INSURANCE_CLAIM",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_EXPECTED_DEATH",
    "kind": "DTE",
    "name": "Expected Death",
    "description": "Anticipated loss, often with hospice or terminal illness",
    "group": "Urgency",
    "metadata": {
      "urgencyLevel": "medium",
      "typicalTimeframe": "24-72 hours",
      "emotionalState": "prepared-grief",
      "commonNeeds": [
        "pre-planned-arrangements",
        "memorial-planning"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_HEART_ATTACK",
    "kind": "DTE",
    "name": "Heart Attack",
    "description": null,
    "group": "Sudden",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_HOMICIDE",
    "kind": "DTE",
    "name": "Homicide",
    "description": null,
    "group": "Circumstantial",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_WRONGFUL_DEATH_CLAIM",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_SECURE_VACANT_PROPERTY",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_FILE_FINAL_TAX_RETURN"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_MEMORIAL_SERVICE",
    "kind": "DTE",
    "name": "Memorial Service Planning",
    "description": "Organizing a memorial or celebration of life",
    "group": "Ceremony",
    "metadata": {
      "urgencyLevel": "medium",
      "typicalTimeframe": "1-2 weeks",
      "commonNeeds": [
        "venue",
        "catering",
        "flowers",
        "officiant"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_OUT_OF_TOWN_DEATH",
    "kind": "DTE",
    "name": "Out-of-Town Death",
    "description": "Death occurred away from home, requires transport/coordination",
    "group": "Logistics",
    "metadata": {
      "urgencyLevel": "high",
      "typicalTimeframe": "0-48 hours",
      "commonNeeds": [
        "body-transport",
        "funeral-home",
        "legal-assistance"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_PRE_PLANNING",
    "kind": "DTE",
    "name": "Pre-Planning",
    "description": "Advanced planning for future arrangements",
    "group": "Planning",
    "metadata": {
      "urgencyLevel": "low",
      "typicalTimeframe": "weeks-months",
      "commonNeeds": [
        "funeral-home",
        "financial-planning",
        "documentation"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_RECEPTION_PLANNING",
    "kind": "DTE",
    "name": "Reception Planning",
    "description": "Planning post-service gathering or reception",
    "group": "Ceremony",
    "metadata": {
      "urgencyLevel": "medium",
      "typicalTimeframe": "3-7 days",
      "commonNeeds": [
        "venue",
        "catering",
        "parking"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_STROKE",
    "kind": "DTE",
    "name": "Stroke",
    "description": null,
    "group": "Sudden",
    "metadata": {
      "urgencyLevel": "urgent",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_NOTIFY_CREDITORS",
        "INTENT_TRANSFER_VEHICLE_TITLE",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN",
        "INTENT_ARRANGE_PET_CARE"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_SUICIDE",
    "kind": "DTE",
    "name": "Suicide",
    "description": null,
    "group": "Circumstantial",
    "metadata": {
      "urgencyLevel": "immediate",
      "intentKeys": [
        "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
        "INTENT_REQUEST_DEATH_CERTIFICATES",
        "INTENT_OBITUARY_SERVICES",
        "INTENT_BURIAL_SERVICES",
        "INTENT_CREMATION_SERVICES",
        "INTENT_NOTIFY_LIFE_INSURANCE",
        "INTENT_DISPUTE_INSURANCE_CLAIM",
        "INTENT_LEGAL_ASSISTANCE",
        "INTENT_NOTIFY_EMPLOYER",
        "INTENT_NOTIFY_SOCIAL_SECURITY",
        "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
        "INTENT_FILE_WILL_WITH_PROBATE_COURT",
        "INTENT_PETITION_FOR_LETTERS",
        "INTENT_OPEN_ESTATE_ACCOUNT",
        "INTENT_SECURE_VACANT_PROPERTY",
        "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
        "INTENT_FILE_FINAL_TAX_RETURN"
      ]
    },
    "isActive": true
  },
  {
    "key": "DTE_UNEXPECTED_DEATH",
    "kind": "DTE",
    "name": "Unexpected Death",
    "description": "Sudden, unanticipated loss requiring immediate arrangements",
    "group": "Urgency",
    "metadata": {
      "urgencyLevel": "high",
      "typicalTimeframe": "0-24 hours",
      "emotionalState": "shock",
      "commonNeeds": [
        "immediate-arrangements",
        "body-transport",
        "grief-support"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_ARRANGE_PET_CARE",
    "kind": "INTENT",
    "name": "Arrange Immediate Pet Care",
    "description": null,
    "group": "Logistics",
    "metadata": {
      "defaultAssignee": "anyone",
      "categoryKeys": [
        "CAT_PET_SERVICES"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_AWAIT_ME_CLEARANCE",
    "kind": "INTENT",
    "name": "Await Medical Examiner Clearance",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_BURIAL_SERVICES",
    "kind": "INTENT",
    "name": "Burial Services",
    "description": "Traditional burial arrangements",
    "group": "Funeral Services",
    "metadata": {
      "priority": "high",
      "typicalProviders": [
        "funeral-home",
        "cemetery"
      ],
      "requiredCapabilities": [
        "burial"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
    "kind": "INTENT",
    "name": "Cancel Subscriptions and Online Accounts",
    "description": null,
    "group": "Logistics",
    "metadata": {
      "defaultAssignee": "family member",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_CHOOSE_DISPOSITION_METHOD",
    "kind": "INTENT",
    "name": "Choose Burial or Cremation",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_COMPARE_FUNERAL_HOMES",
    "kind": "INTENT",
    "name": "Compare Funeral Home Pricing",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_CONFIRM_PRONOUNCEMENT",
    "kind": "INTENT",
    "name": "Confirm Pronouncement of Death",
    "description": null,
    "group": "Immediate",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_CREMATION_SERVICES",
    "kind": "INTENT",
    "name": "Cremation Services",
    "description": "Find providers offering cremation",
    "group": "Funeral Services",
    "metadata": {
      "priority": "high",
      "typicalProviders": [
        "funeral-home",
        "crematorium"
      ],
      "requiredCapabilities": [
        "cremation"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_DEATH_CERTIFICATE",
    "kind": "INTENT",
    "name": "INTENT_DEATH_CERTIFICATE",
    "description": null,
    "group": null,
    "metadata": null,
    "isActive": true
  },
  {
    "key": "INTENT_DECIDE_FINAL_PLACEMENT",
    "kind": "INTENT",
    "name": "Decide Final Placement of Ashes",
    "description": null,
    "group": "Cremation",
    "metadata": {
      "defaultAssignee": "family_member",
      "categoryKeys": [
        "CAT_CEMETERY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_DELEGATE_DAY_OF_SUPPORT",
    "kind": "INTENT",
    "name": "Delegate Day-of Support",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "family_member",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_DISPUTE_INSURANCE_CLAIM",
    "kind": "INTENT",
    "name": "Dispute Life Insurance Claim Denial",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_FILE_FINAL_TAX_RETURN",
    "kind": "INTENT",
    "name": "File Final Tax Return",
    "description": null,
    "group": "Financial",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ACCOUNTANT"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_FILE_WILL_WITH_PROBATE_COURT",
    "kind": "INTENT",
    "name": "File Will with Probate Court",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_FUNERAL_PLANNING_MEETING",
    "kind": "INTENT",
    "name": "Meet with Funeral Director",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_GRIEF_COUNSELING",
    "kind": "INTENT",
    "name": "Grief Counseling",
    "description": "Find grief counselor or therapist",
    "group": "Support Services",
    "metadata": {
      "priority": "low-medium",
      "typicalProviders": [
        "counselor",
        "therapist"
      ],
      "requiredCapabilities": [
        "bereavement-specialty"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
    "kind": "INTENT",
    "name": "Immediate Funeral Arrangements",
    "description": "Find funeral home for immediate service needs",
    "group": "Funeral Services",
    "metadata": {
      "priority": "critical",
      "typicalProviders": [
        "funeral-home"
      ],
      "requiredCapabilities": [
        "24-7-available",
        "body-transport"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_LEGAL_ASSISTANCE",
    "kind": "INTENT",
    "name": "Legal Assistance",
    "description": "Estate planning, probate, death certificates",
    "group": "Administrative",
    "metadata": {
      "priority": "medium",
      "typicalProviders": [
        "attorney",
        "funeral-home"
      ],
      "requiredCapabilities": [
        "estate-planning"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
    "kind": "INTENT",
    "name": "Locate Will and Estate Documents",
    "description": null,
    "group": "Estate",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_NOTIFY_CREDITORS",
    "kind": "INTENT",
    "name": "Notify Creditors of Death",
    "description": null,
    "group": "Financial",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_NOTIFY_EMPLOYER",
    "kind": "INTENT",
    "name": "Notify Employer or HR",
    "description": null,
    "group": "Notifications",
    "metadata": {
      "defaultAssignee": "family member",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_NOTIFY_FAMILY_AND_NETWORK",
    "kind": "INTENT",
    "name": "Notify Family and Personal Network",
    "description": null,
    "group": "Communication",
    "metadata": {
      "defaultAssignee": "anyone",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_NOTIFY_LIFE_INSURANCE",
    "kind": "INTENT",
    "name": "File Life Insurance Claim",
    "description": null,
    "group": "Financial",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_NOTIFY_SOCIAL_SECURITY",
    "kind": "INTENT",
    "name": "Notify Social Security Administration",
    "description": null,
    "group": "Notifications",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_OBITUARY_SERVICES",
    "kind": "INTENT",
    "name": "Obituary Services",
    "description": "Writing and publishing obituaries",
    "group": "Memorial Items",
    "metadata": {
      "priority": "medium",
      "typicalProviders": [
        "funeral-home",
        "newspaper"
      ],
      "requiredCapabilities": [
        "obituary-writing"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_OBTAIN_DISPOSITION_PERMIT",
    "kind": "INTENT",
    "name": "Obtain Disposition Permit",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_OPEN_ESTATE_ACCOUNT",
    "kind": "INTENT",
    "name": "Open an Estate Bank Account",
    "description": null,
    "group": "Financial",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FINANCIAL_INSTITUTION"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_PETITION_FOR_LETTERS",
    "kind": "INTENT",
    "name": "Petition for Letters Testamentary",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_PLAN_DAY_OF_SERVICE",
    "kind": "INTENT",
    "name": "Plan Day-of Service Logistics",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_PLAN_SERVICE_DETAILS",
    "kind": "INTENT",
    "name": "Plan Service Details",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_RECEIVE_CREMATED_REMAINS",
    "kind": "INTENT",
    "name": "Receive Cremated Remains",
    "description": null,
    "group": "Cremation",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_CREMATION_PROVIDER"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_RECEPTION_VENUE",
    "kind": "INTENT",
    "name": "Reception Venue",
    "description": "Find suitable space for memorial reception",
    "group": "Event Planning",
    "metadata": {
      "priority": "medium",
      "typicalProviders": [
        "restaurant",
        "event-venue",
        "community-center"
      ],
      "requiredCapabilities": [
        "large-party",
        "catering"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_RELOCATION_SUPPORT",
    "kind": "INTENT",
    "name": "Relocation Support",
    "description": null,
    "group": "Logistics",
    "metadata": {
      "defaultAssignee": "family member",
      "categoryKeys": [
        "CAT_MOVING_SERVICES"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_REQUEST_DEATH_CERTIFICATES",
    "kind": "INTENT",
    "name": "Request Death Certificates",
    "description": null,
    "group": "Immediate",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_REVIEW_FUNERAL_CONTRACT",
    "kind": "INTENT",
    "name": "Review and Sign Funeral Contract",
    "description": null,
    "group": "Funeral Arrangements",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_SECURE_VACANT_PROPERTY",
    "kind": "INTENT",
    "name": "Secure the Vacant Property",
    "description": null,
    "group": "Logistics",
    "metadata": {
      "defaultAssignee": "anyone",
      "categoryKeys": [
        "CAT_HOME_SECURITY"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_SIGN_CREMATION_AUTHORIZATION",
    "kind": "INTENT",
    "name": "Sign Cremation Authorization",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_SYMPATHY_FLOWERS",
    "kind": "INTENT",
    "name": "Sympathy Flowers (Intent)",
    "description": "Order funeral/sympathy flower arrangements",
    "group": "Memorial Items",
    "metadata": {
      "priority": "medium",
      "typicalProviders": [
        "florist"
      ],
      "requiredCapabilities": [
        "sympathy-arrangements",
        "delivery"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_TRANSFER_REMAINS",
    "kind": "INTENT",
    "name": "Transfer Remains to Funeral Home",
    "description": null,
    "group": "Immediate",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME",
        "CAT_CREMATION_PROVIDER"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_TRANSFER_VEHICLE_TITLE",
    "kind": "INTENT",
    "name": "Transfer Vehicle Title",
    "description": null,
    "group": "Estate",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_TRAVEL_BOOKING",
    "kind": "INTENT",
    "name": "Travel Booking",
    "description": null,
    "group": "Logistics",
    "metadata": {
      "defaultAssignee": "family member",
      "categoryKeys": []
    },
    "isActive": true
  },
  {
    "key": "INTENT_VERIFY_REMAINS_IDENTITY",
    "kind": "INTENT",
    "name": "Verify Identity of Remains",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_FUNERAL_HOME"
      ]
    },
    "isActive": true
  },
  {
    "key": "INTENT_WRONGFUL_DEATH_CLAIM",
    "kind": "INTENT",
    "name": "Consult on Wrongful Death Claim",
    "description": null,
    "group": "Legal",
    "metadata": {
      "defaultAssignee": "organizer",
      "categoryKeys": [
        "CAT_ATTORNEY"
      ]
    },
    "isActive": true
  },
  {
    "key": "TAG_COMPASSIONATE",
    "kind": "TAG",
    "name": "Compassionate",
    "description": "Known for empathetic service",
    "group": "Service Quality",
    "metadata": {
      "reputationTrait": true
    },
    "isActive": true
  },
  {
    "key": "TAG_ESTABLISHED",
    "kind": "TAG",
    "name": "Established",
    "description": "Long-standing business (10+ years)",
    "group": "Business Type",
    "metadata": {
      "sentimentValue": "positive"
    },
    "isActive": true
  },
  {
    "key": "TAG_FAMILY_OWNED",
    "kind": "TAG",
    "name": "Family Owned",
    "description": "Locally owned family business",
    "group": "Business Type",
    "metadata": {
      "sentimentValue": "positive"
    },
    "isActive": true
  },
  {
    "key": "TAG_INTIMATE_SETTING",
    "kind": "TAG",
    "name": "Intimate Setting",
    "description": "Better suited for small gatherings",
    "group": "Capacity",
    "metadata": {
      "maxCapacity": 20
    },
    "isActive": true
  },
  {
    "key": "TAG_LARGE_PARTY_OK",
    "kind": "TAG",
    "name": "Large Party Capable",
    "description": "Can accommodate 25+ people",
    "group": "Capacity",
    "metadata": {
      "minCapacity": 25
    },
    "isActive": true
  },
  {
    "key": "TAG_LOCAL_DELIVERY",
    "kind": "TAG",
    "name": "Local Delivery",
    "description": "Delivers within local area",
    "group": "Logistics",
    "metadata": {
      "importance": "high-for-flowers"
    },
    "isActive": true
  },
  {
    "key": "TAG_MODERN_FACILITY",
    "kind": "TAG",
    "name": "Modern Facility",
    "description": "Contemporary design and amenities",
    "group": "Atmosphere",
    "metadata": {
      "sentimentValue": "neutral"
    },
    "isActive": true
  },
  {
    "key": "TAG_OPEN_24_7",
    "kind": "TAG",
    "name": "Open 24/7",
    "description": "Available around the clock",
    "group": "Availability",
    "metadata": {
      "importance": "high-for-urgent"
    },
    "isActive": true
  },
  {
    "key": "TAG_PARKING_AVAILABLE",
    "kind": "TAG",
    "name": "Parking Available",
    "description": "On-site or nearby parking",
    "group": "Facilities",
    "metadata": {
      "importance": "medium"
    },
    "isActive": true
  },
  {
    "key": "TAG_PRIVATE_ROOM",
    "kind": "TAG",
    "name": "Private Room Available",
    "description": "Has private spaces for gatherings",
    "group": "Facilities",
    "metadata": {
      "importance": "high-for-receptions"
    },
    "isActive": true
  },
  {
    "key": "TAG_PROFESSIONAL",
    "kind": "TAG",
    "name": "Professional",
    "description": "High professional standards",
    "group": "Service Quality",
    "metadata": {
      "reputationTrait": true
    },
    "isActive": true
  },
  {
    "key": "TAG_QUIET_ATMOSPHERE",
    "kind": "TAG",
    "name": "Quiet Atmosphere",
    "description": "Peaceful, subdued environment",
    "group": "Atmosphere",
    "metadata": {
      "importance": "medium-for-receptions"
    },
    "isActive": true
  },
  {
    "key": "TAG_RESPONSIVE",
    "kind": "TAG",
    "name": "Responsive",
    "description": "Quick to respond to inquiries",
    "group": "Service Quality",
    "metadata": {
      "reputationTrait": true
    },
    "isActive": true
  },
  {
    "key": "TAG_SAME_DAY_DELIVERY",
    "kind": "TAG",
    "name": "Same Day Delivery",
    "description": "Can deliver same day",
    "group": "Logistics",
    "metadata": {
      "importance": "high-for-urgent"
    },
    "isActive": true
  },
  {
    "key": "TAG_TRADITIONAL",
    "kind": "TAG",
    "name": "Traditional",
    "description": "Classic, time-honored approach",
    "group": "Atmosphere",
    "metadata": {
      "sentimentValue": "neutral"
    },
    "isActive": true
  },
  {
    "key": "TAG_URGENT_CAPABLE",
    "kind": "TAG",
    "name": "Urgent/Immediate Service",
    "description": "Can handle immediate/same-day requests",
    "group": "Availability",
    "metadata": {
      "importance": "high-for-urgent"
    },
    "isActive": true
  },
  {
    "key": "TAG_VETERAN_OWNED",
    "kind": "TAG",
    "name": "Veteran Owned",
    "description": "Owned/operated by military veterans",
    "group": "Business Type",
    "metadata": {
      "sentimentValue": "positive"
    },
    "isActive": true
  },
  {
    "key": "TAG_WEEKENDS_AVAILABLE",
    "kind": "TAG",
    "name": "Weekend Service",
    "description": "Available on Saturdays and Sundays",
    "group": "Availability",
    "metadata": {
      "importance": "medium"
    },
    "isActive": true
  },
  {
    "key": "TAG_WHEELCHAIR_ACCESSIBLE",
    "kind": "TAG",
    "name": "Wheelchair Accessible",
    "description": "ADA compliant facilities",
    "group": "Facilities",
    "metadata": {
      "importance": "high"
    },
    "isActive": true
  }
];

const actionRows: ActionSeed[] = [
  {
    "intentKey": "INTENT_ARRANGE_PET_CARE",
    "title": "Arrange immediate care for pets left behind",
    "defaultAssignee": "anyone",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_PET_SERVICES"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_AWAIT_ME_CLEARANCE",
    "title": "Await medical examiner clearance before arrangements",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_CONFIRM_PRONOUNCEMENT"
    ],
    "taxonomies": [],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_BURIAL_SERVICES",
    "title": "Select burial site and schedule interment",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_CEMETERY",
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_CANCEL_SUBSCRIPTIONS_ACCOUNTS",
    "title": "Cancel recurring subscriptions and digital accounts",
    "defaultAssignee": "family_member",
    "priority": "medium",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_CHOOSE_DISPOSITION_METHOD",
    "title": "Decide on burial or cremation",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_COMPARE_FUNERAL_HOMES",
    "title": "Request price lists from 2 or more funeral homes",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": "financial",
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_CONFIRM_PRONOUNCEMENT",
    "title": "Confirm official pronouncement of death",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_CREMATION_SERVICES",
    "title": "Authorize cremation with the funeral home",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_CREMATION_PROVIDER",
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_DEATH_CERTIFICATE",
    "title": "Obtain a certified copy of the death certificate",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_DECIDE_FINAL_PLACEMENT",
    "title": "Decide final placement or disposition of ashes",
    "defaultAssignee": "family_member",
    "priority": "medium",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_RECEIVE_CREMATED_REMAINS"
    ],
    "taxonomies": [
      "CAT_CEMETERY"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_DELEGATE_DAY_OF_SUPPORT",
    "title": "Enlist a trusted person to help coordinate the funeral day",
    "defaultAssignee": "family_member",
    "priority": "medium",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_PLAN_DAY_OF_SERVICE"
    ],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_DISPUTE_INSURANCE_CLAIM",
    "title": "Dispute life insurance denial or contestability",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_NOTIFY_LIFE_INSURANCE"
    ],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_FILE_FINAL_TAX_RETURN",
    "title": "File final federal and {event.state} state tax returns",
    "defaultAssignee": "organizer",
    "priority": "medium",
    "phaseHint": "ongoing",
    "dependsOnIntentKeys": [
      "INTENT_OPEN_ESTATE_ACCOUNT"
    ],
    "taxonomies": [
      "CAT_ACCOUNTANT"
    ],
    "resourceKind": "financial",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_FILE_WILL_WITH_PROBATE_COURT",
    "title": "File will with the {event.state} Probate Court",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_LOCATE_WILL_AND_ESTATE_DOCS"
    ],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_FUNERAL_PLANNING_MEETING",
    "title": "Meet with funeral director to plan the service",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_CHOOSE_DISPOSITION_METHOD"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS",
    "title": "Contact a funeral home to begin arrangements",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_LEGAL_ASSISTANCE",
    "title": "Consult an estate attorney in {event.state}",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_LOCATE_WILL_AND_ESTATE_DOCS",
    "title": "Locate will, trusts, and safe deposit keys",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_NOTIFY_CREDITORS",
    "title": "Publish creditor notice and notify lenders",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_OPEN_ESTATE_ACCOUNT"
    ],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_NOTIFY_EMPLOYER",
    "title": "Contact HR to report death and claim benefits",
    "defaultAssignee": "family_member",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_NOTIFY_FAMILY_AND_NETWORK",
    "title": "Notify family, friends, and employer of the death",
    "defaultAssignee": "anyone",
    "priority": "high",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_NOTIFY_LIFE_INSURANCE",
    "title": "Notify life insurance company and file claim",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": "financial",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_NOTIFY_SOCIAL_SECURITY",
    "title": "Report death to Social Security, start survivor benefits",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_OBITUARY_SERVICES",
    "title": "Write and publish the obituary",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME",
      "CAT_NEWSPAPER"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_OBTAIN_DISPOSITION_PERMIT",
    "title": "Obtain disposition permit from county health department",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_DEATH_CERTIFICATE"
    ],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_OPEN_ESTATE_ACCOUNT",
    "title": "Open an estate checking account at your bank",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_PETITION_FOR_LETTERS"
    ],
    "taxonomies": [
      "CAT_FINANCIAL_INSTITUTION"
    ],
    "resourceKind": "financial",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_PETITION_FOR_LETTERS",
    "title": "Petition court for Letters Testamentary",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_FILE_WILL_WITH_PROBATE_COURT"
    ],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_PLAN_DAY_OF_SERVICE",
    "title": "Finalize order of service and day-of logistics",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_PLAN_SERVICE_DETAILS"
    ],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_PLAN_SERVICE_DETAILS",
    "title": "Choose service date, speakers, music, and readings",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_FUNERAL_PLANNING_MEETING"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_RECEIVE_CREMATED_REMAINS",
    "title": "Receive ashes and cremation certificate from provider",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_CREMATION_SERVICES"
    ],
    "taxonomies": [
      "CAT_CREMATION_PROVIDER"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_RELOCATION_SUPPORT",
    "title": "Arrange moving support for estate transition",
    "defaultAssignee": "family_member",
    "priority": "medium",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_MOVING_SERVICES"
    ],
    "resourceKind": "moving",
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_REQUEST_DEATH_CERTIFICATES",
    "title": "Order 10-12 certified death certificates",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_REVIEW_FUNERAL_CONTRACT",
    "title": "Review itemized price list and sign funeral contract",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [
      "INTENT_FUNERAL_PLANNING_MEETING"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": "financial",
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_SECURE_VACANT_PROPERTY",
    "title": "Secure the home and notify homeowner's insurance",
    "defaultAssignee": "anyone",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_HOME_SECURITY"
    ],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_SIGN_CREMATION_AUTHORIZATION",
    "title": "Sign cremation authorization form",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_IMMEDIATE_FUNERAL_ARRANGEMENTS"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_TRANSFER_REMAINS",
    "title": "Arrange transport of remains to funeral home",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_CONFIRM_PRONOUNCEMENT"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME",
      "CAT_CREMATION_PROVIDER"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_TRANSFER_VEHICLE_TITLE",
    "title": "Transfer vehicle title at the Tag Office",
    "defaultAssignee": "organizer",
    "priority": "medium",
    "phaseHint": "1-2 weeks",
    "dependsOnIntentKeys": [
      "INTENT_PETITION_FOR_LETTERS"
    ],
    "taxonomies": [],
    "resourceKind": null,
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_TRAVEL_BOOKING",
    "title": "Book travel to {event.city} for family members",
    "defaultAssignee": "family_member",
    "priority": "high",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [],
    "taxonomies": [],
    "resourceKind": "travel",
    "locale": "US",
    "isActive": true
  },
  {
    "intentKey": "INTENT_VERIFY_REMAINS_IDENTITY",
    "title": "Confirm identification of remains with funeral home",
    "defaultAssignee": "organizer",
    "priority": "critical",
    "phaseHint": "0-24h",
    "dependsOnIntentKeys": [
      "INTENT_SIGN_CREMATION_AUTHORIZATION"
    ],
    "taxonomies": [
      "CAT_FUNERAL_HOME"
    ],
    "resourceKind": null,
    "locale": "",
    "isActive": true
  },
  {
    "intentKey": "INTENT_WRONGFUL_DEATH_CLAIM",
    "title": "Consult a wrongful death attorney in {event.state}",
    "defaultAssignee": "organizer",
    "priority": "high",
    "phaseHint": "24-72h",
    "dependsOnIntentKeys": [],
    "taxonomies": [
      "CAT_ATTORNEY"
    ],
    "resourceKind": "legal",
    "locale": "US",
    "isActive": true
  }
];

function mapAssignee(value: ActionSeed["defaultAssignee"]): ActionAssigneeKind {
  switch (value) {
    case "family_member":
      return ActionAssigneeKind.family_member;
    case "anyone":
      return ActionAssigneeKind.anyone;
    default:
      return ActionAssigneeKind.organizer;
  }
}

function mapPriority(value: ActionSeed["priority"]): ActionPriority {
  switch (value) {
    case "critical":
      return ActionPriority.critical;
    case "high":
      return ActionPriority.high;
    case "medium":
      return ActionPriority.medium;
    default:
      return ActionPriority.low;
  }
}

function normalizeUrgency(value: unknown): "immediate" | "urgent" | "soon" | "short_term" | "ongoing" {
  const urgency = typeof value === "string" ? value.toLowerCase() : "";
  switch (urgency) {
    case "immediate":
      return "immediate";
    case "urgent":
    case "high":
      return "urgent";
    case "soon":
    case "medium":
      return "soon";
    case "short_term":
    case "low":
      return "short_term";
    default:
      return "ongoing";
  }
}

function inferIntentKeysForDte(urgency: ReturnType<typeof normalizeUrgency>, rows: ActionSeed[]): string[] {
  const phasesByUrgency: Record<ReturnType<typeof normalizeUrgency>, ActionSeed["phaseHint"][]> = {
    immediate: ["0-24h", "24-72h"],
    urgent: ["0-24h", "24-72h"],
    soon: ["24-72h", "1-2 weeks"],
    short_term: ["1-2 weeks", "ongoing"],
    ongoing: ["ongoing"],
  };

  const phases = new Set(phasesByUrgency[urgency]);
  const candidates = rows
    .filter((row) => phases.has(row.phaseHint))
    .map((row) => row.intentKey);

  return [...new Set(candidates)];
}

const UNIVERSAL_DTE_INTENTS = [
  "INTENT_CONFIRM_PRONOUNCEMENT",
  "INTENT_TRANSFER_REMAINS",
  "INTENT_NOTIFY_FAMILY_AND_NETWORK",
  "INTENT_CHOOSE_DISPOSITION_METHOD",
  "INTENT_FUNERAL_PLANNING_MEETING",
  "INTENT_COMPARE_FUNERAL_HOMES",
  "INTENT_REVIEW_FUNERAL_CONTRACT",
  "INTENT_PLAN_SERVICE_DETAILS",
  "INTENT_PLAN_DAY_OF_SERVICE",
  "INTENT_DELEGATE_DAY_OF_SUPPORT",
  "INTENT_OBTAIN_DISPOSITION_PERMIT",
  "INTENT_SIGN_CREMATION_AUTHORIZATION",
  "INTENT_VERIFY_REMAINS_IDENTITY",
  "INTENT_RECEIVE_CREMATED_REMAINS",
  "INTENT_DECIDE_FINAL_PLACEMENT",
] as const;

const DTE_KEYS_WITH_ME_CLEARANCE = new Set<string>([
  "DTE_HEART_ATTACK",
  "DTE_CAR_ACCIDENT",
  "DTE_DRUG_OVERDOSE",
  "DTE_HOMICIDE",
  "DTE_SUICIDE",
  "DTE_DEATH_OF_MINOR",
  "DTE_DEATH_ABROAD",
]);

function normalizeDteMetadata(
  dteKey: string,
  metadata: Record<string, unknown> | null,
  rows: ActionSeed[],
): Record<string, unknown> {
  const current = metadata ?? {};
  const urgencyLevel = normalizeUrgency(current.urgencyLevel);
  const existingIntentKeys = Array.isArray(current.intentKeys)
    ? current.intentKeys.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  const baseIntentKeys = existingIntentKeys.length > 0
    ? existingIntentKeys
    : inferIntentKeysForDte(urgencyLevel, rows);

  const merged = new Set<string>([...baseIntentKeys, ...UNIVERSAL_DTE_INTENTS]);

  if (DTE_KEYS_WITH_ME_CLEARANCE.has(dteKey)) {
    merged.add("INTENT_AWAIT_ME_CLEARANCE");
  } else {
    merged.delete("INTENT_AWAIT_ME_CLEARANCE");
  }

  const intentKeys = [...merged];

  return {
    ...current,
    urgencyLevel,
    intentKeys,
  };
}

async function repairNullTimestamps(collection: "TaxonomyNode" | "Action"): Promise<void> {
  const result = await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: {
          $or: [
            { createdAt: null },
            { createdAt: { $exists: false } },
            { updatedAt: null },
            { updatedAt: { $exists: false } },
          ],
        },
        u: [
          {
            $set: {
              createdAt: { $ifNull: ["$createdAt", "$$NOW"] },
              updatedAt: { $ifNull: ["$updatedAt", "$$NOW"] },
            },
          },
        ],
        multi: true,
      },
    ],
  }) as { nModified?: number };

  console.log(
    `  ✓ Repaired ${collection} null timestamps: ${result?.nModified ?? 0} record(s)`,
  );
}

async function withWriteConflictRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const isWriteConflict = code === "P2034";
      if (!isWriteConflict || attempt >= retries) throw error;

      attempt += 1;
      const backoffMs = 100 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

async function main() {
  console.log("🌱 Seeding canonical blueprint taxonomy + actions...\n");

  // Repair legacy rows with null/missing DateTime fields before Prisma upserts.
  await repairNullTimestamps("TaxonomyNode");
  await repairNullTimestamps("Action");

  for (const node of taxonomyRows) {
    const metadata = (node.kind === "DTE"
      ? normalizeDteMetadata(node.key, node.metadata, actionRows)
      : (node.metadata ?? undefined)) as Prisma.InputJsonValue | undefined;

    const result = await withWriteConflictRetry(() => prisma.taxonomyNode.upsert({
      where: { key: node.key },
      create: {
        key: node.key,
        kind: node.kind as TaxonomyKind,
        name: node.name,
        description: node.description ?? undefined,
        group: node.group ?? undefined,
        metadata,
        isActive: node.isActive,
      },
      update: {
        kind: node.kind as TaxonomyKind,
        name: node.name,
        description: node.description ?? undefined,
        group: node.group ?? undefined,
        metadata,
        isActive: node.isActive,
      },
    }));

    console.log(`  ✓ TAXONOMY [${result.kind}] ${result.key}`);
  }

  for (const row of actionRows) {
    await withWriteConflictRetry(() => prisma.action.upsert({
      where: {
        intentKey_locale: {
          intentKey: row.intentKey,
          locale: row.locale,
        },
      },
      create: {
        intentKey: row.intentKey,
        title: row.title,
        defaultAssignee: mapAssignee(row.defaultAssignee),
        priority: mapPriority(row.priority),
        phaseHint: row.phaseHint,
        dependsOnIntentKeys: row.dependsOnIntentKeys,
        taxonomies: row.taxonomies,
        resourceKind: row.resourceKind,
        locale: row.locale,
        isActive: row.isActive,
      },
      update: {
        title: row.title,
        defaultAssignee: mapAssignee(row.defaultAssignee),
        priority: mapPriority(row.priority),
        phaseHint: row.phaseHint,
        dependsOnIntentKeys: row.dependsOnIntentKeys,
        taxonomies: row.taxonomies,
        resourceKind: row.resourceKind,
        isActive: row.isActive,
      },
    }));

    console.log(`  ✓ ACTION [${row.intentKey}] locale=${row.locale || "universal"}`);
  }

  console.log("\n✅ Blueprint seed complete.");
  console.log(`   taxonomy=${taxonomyRows.length} actions=${actionRows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
