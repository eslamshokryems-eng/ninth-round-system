export interface NavLink {
  label: string;
  href: string;
}

export const PROGRAM_LINKS: NavLink[] = [
  { label: "Boxing", href: "/programs/boxing" },
  { label: "Kickboxing", href: "/programs/kickboxing" },
  { label: "The 9-Round Circuit", href: "/programs/fitness" },
  { label: "Personal Training", href: "/programs/personal-training" },
  { label: "Kids / Junior", href: "/programs/kids" },
];

export const PRIMARY_NAV: NavLink[] = [
  { label: "Programs", href: "/programs" },
  { label: "Why 9th Round", href: "/about" },
  { label: "Coaches", href: "/coaches" },
  { label: "Memberships", href: "/memberships" },
  { label: "Contact", href: "/contact" },
];

export const FOOTER_NAV: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Programs", href: "/programs" },
  { label: "Boxing", href: "/programs/boxing" },
  { label: "Kickboxing", href: "/programs/kickboxing" },
  { label: "Personal Training", href: "/programs/personal-training" },
  { label: "Kids / Junior", href: "/programs/kids" },
  { label: "Coaches", href: "/coaches" },
  { label: "Memberships", href: "/memberships" },
  { label: "Contact", href: "/contact" },
];
