/**
 * Project media catalogue.
 *
 * These are direct Google Cloud image assets extracted from the Stitch design
 * screens. They are used as high-fidelity placeholders for project photography
 * across cards, heroes, and detail pages.
 *
 * Key by project slug so every component can import a single source of truth.
 */

export interface ProjectMediaAssets {
  /** Primary card / hero cover image URL. */
  cover: string;
  /** Poster frame shown behind the play button in the video showcase. */
  videoPoster: string;
  /** Gallery images (up to 4). */
  gallery: string[];
  /** Live telemetry lines rendered in the showcase HUD. */
  telemetry: { label: string; value: string; unit: string }[];
  /** Key spec ribbon items shown under the showcase. */
  specs: { icon: string; label: string; value: string }[];
}

const HELIOFROST_COVER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDlitnxO6QjvbU4peMcPKb1wHrbWGQazwTW0LmbGM3veXU_0ubrIPGkeLOeKzndv06iprcOURWhP1UZZq5aC_WGNY-H7FS_o_P4VCelZaGjM6UlCdk4Gjbg98HbescpYTv1FEtnx45sJLVhlRNRZLcjkcAE2NBJI8sK9s_g2L2sEVf0pNA3ujucHUPm26rOeoY9Zba5jPqfdcAmY-bZbnC21hYzWc5OYFOsYhuYwiItdvGEBm5iY8Pm';

const HELIOFROST_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBt3oGRLiP8fH_I-GBaWkIy2EqJEQNgSzv4Li_JVQG8UHoEE1qpF6bnBkviwjSf_-HfFqIRAg-dP8Op2Bk3FYagfA90Gsap2C_3WJW1EV5fGy1YXDDJNA9JOyx5HPyjW2EpZQwDVdMewgWZKMObd9njfqj17oioJbeFc_l11nNC62PFr-6xaiuP2Rwej-UH97Znq1FepkQk7tSIhIIohuPLbFhspKAr0MGND2u8OIAXTpqDB7PPRThS';

const HELIOFROST_FACTORY =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCJzc-y6tPj46r76rSFQU-IEBP25EAWp5-IW0FvMB6U-oPt7c3AONp4bgnZ1A4VHEShBJbl4aNsILrQlsWPN9nlR65oqKjGqwGQcbUVeel_rllgiJhJg_uWJQJ-om2yx6R2ec3b-tGslDlWV14NUjgceTQgl4bRRc4SJ17MjCVQJZvvV2CiERCEvqLBYkUA3Da0suCOkCpZPvuIr6lQob0by0XS3-U6hHHyxu04VG7JhcZww-iYVKZd';

const HELIOFROST_THERMAL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB4Qtqf2rzc1uFXtDbMAMpJlMaUcJ9riyaQemsZzY5bDHl5VOAgz1PLZnH0wLjdTXaalmKTIZu38HqGb8rUdoSP3nt2E8e3nped8hLhVJsWrvv9uSIj7YVDv9NE8sBAkWkoTaGwcNgkj6XRclN2QMJgHtfkEsLzsM-NYoRHDukFHB_PJEej9DMQVm_47wcUc9LklT1sNRNX6wRHd3UlQ8fY2Qg0cMiutHDeFM2LHqrpGO4mQx0FhXia';

const AEROPULSE_COVER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAuvtGoF6qsq3HCnu4Ufc7tcuhcX0KjiKDwNFQ8obc-BkXqG0_fuQDEXNjZ1ZhE75q3V3vhjN57nIbE2iTi8xcfA1RGsnxRfqn2EKvRqaImsxe4lU_0FRf4Vc4escrDDHa7ZMdQMkCF-mdV5E2mBqKlZA580Im-bsJ5B6znhPeH9ogIdoZtj7mBK2k2SPfO2EP0LGeBikPNfZgGRyN_gpOtLJpcbiAmqD3iVUt2Q9wyx-SHBXL4Aze9';

const RIGIDGRIP_COVER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC8RVXFhT8X7gqS1yTZiwDRevHmPQ4_MMCZmcaRA7l-GkCUEVBySZTKEZ2PoaAwRk76ShsAVRMOzqOt5UkTHA-emK2XuaUmSeyIyDSqd463Um-ppfWGb35wZGSKVgqWJfvV6h-uWeqMC5YDiMnY33vVJeVq4vBzjUsY3ml5ZDD--4fTsxJGlaDAe6ejhiw7fm1FYqyQaGb4lshzOnQJlvBVty5cyC188IMiWz1TVkKs4EdExEV6Fndk';

/** Map from project slug → media assets. */
export const projectMedia: Record<string, ProjectMediaAssets> = {
  'heliofrost-pro': {
    cover: HELIOFROST_COVER,
    videoPoster: HELIOFROST_POSTER,
    gallery: [HELIOFROST_POSTER, HELIOFROST_FACTORY, HELIOFROST_THERMAL, HELIOFROST_COVER],
    telemetry: [
      { label: 'CHAMBER TEMP', value: '+4.12', unit: '°C STABLE' },
      { label: 'SOLAR IN', value: '174.6', unit: 'W' },
      { label: 'COMPRESSOR', value: 'ACTIVE', unit: 'PWM 73%' },
      { label: 'CAD REV', value: '4.2.1', unit: 'PROD' },
    ],
    specs: [
      { icon: 'thermostat', label: 'Thermal range', value: '2–8 °C' },
      { icon: 'battery_charging_full', label: 'Off-grid holdover', value: '72 h' },
      { icon: 'solar_power', label: 'Solar in', value: '200 W peak' },
    ],
  },
  'aeropulse-m2-lidar': {
    cover: AEROPULSE_COVER,
    videoPoster: AEROPULSE_COVER,
    gallery: [AEROPULSE_COVER],
    telemetry: [
      { label: 'RANGE', value: '250', unit: 'm' },
      { label: 'POINT DENSITY', value: '640k', unit: 'pts/s' },
      { label: 'WEIGHT', value: '892', unit: 'g' },
      { label: 'GIMBAL', value: 'TOOL-FREE', unit: 'MOUNT' },
    ],
    specs: [
      { icon: 'radar', label: 'Max range', value: '250 m' },
      { icon: 'scale', label: 'All-up weight', value: '< 900 g' },
      { icon: 'settings_input_component', label: 'Interface', value: 'Tool-free' },
    ],
  },
  'rigidgrip-cobot-gripper': {
    cover: RIGIDGRIP_COVER,
    videoPoster: RIGIDGRIP_COVER,
    gallery: [RIGIDGRIP_COVER],
    telemetry: [
      { label: 'GRIP FORCE', value: '45', unit: 'N PEAK' },
      { label: 'SLIP DETECT', value: 'ACTIVE', unit: 'EtherCAT' },
      { label: 'PAYLOAD', value: '3.5', unit: 'kg' },
      { label: 'STATUS', value: 'DELIVERED', unit: '✓' },
    ],
    specs: [
      { icon: 'precision_manufacturing', label: 'Grip force', value: '45 N' },
      { icon: 'link', label: 'Protocol', value: 'EtherCAT' },
      { icon: 'inventory_2', label: 'Payload', value: '3.5 kg' },
    ],
  },
};

/** Get media for a project, falling back to empty defaults. */
export function getProjectMedia(slug: string): ProjectMediaAssets {
  return (
    projectMedia[slug] ?? {
      cover: '',
      videoPoster: '',
      gallery: [],
      telemetry: [],
      specs: [],
    }
  );
}
