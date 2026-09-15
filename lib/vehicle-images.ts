export const CLASS_IMAGE_MAP: Record<string, string> = {
  Economy:
    'https://commons.wikimedia.org/wiki/Special:FilePath/2024%20BYD%20Seal%2006%20DM-i.jpg?width=400',
  SUV: 'https://commons.wikimedia.org/wiki/Special:FilePath/SUV_Kaiyi_X3.jpg?width=400',
  Compact:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Dongfeng%20Box%2C%20Auto%202025%2C%20Zurich%20%2820251029-P1074503%29.jpg?width=400',
  Minivan:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Minivan%20Los%20Robles.jpg?width=400',
  'Mid-size':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Honda%20Accord%20%28tenth%20generation%3B%20CV%29%20%28front%20view%29%20in%2016%20Ilir%20-%20Palembang%2C%20SS.jpg?width=400',
  Luxury:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Mercedes-Benz%20W223%20IAA%202021%201X7A0206.jpg?width=400',
  'Full-size':
    'https://commons.wikimedia.org/wiki/Special:FilePath/2002%20Chevrolet%20Impala%20LS%2C%20front%20left%2C%2005-26-2025.jpg?width=400',
  Convertible:
    'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%204%20SERIES%20CONVERTIBLE%20%28G23%29%20China.jpg?width=400',
  Pickup:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chevrolet%20Pickup%20Truck%20Mod%20Kulmbach%202018%20P6170255.jpg?width=400',
  'Compact Plus':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Hyundai%20i30%20N%2C%20IAA%202017%2C%20Frankfurt%20%281Y7A3187%29.jpg?width=400',
};

// Make/model-specific images (Plan 04-10) — keyed by "${make} ${model}". Covers the 2 new
// makes/models added per VehicleClass by scripts/reassign-vehicle-makes.mjs; the pre-existing
// (kept) pair per class still falls back to CLASS_IMAGE_MAP above.
export const VEHICLE_IMAGE_MAP: Record<string, string> = {
  'Hyundai Accent':
    'https://commons.wikimedia.org/wiki/Special:FilePath/2012%20Hyundai%20Accent%20%28RB%29%20Premium%20sedan%20%282018-10-01%29%2001.jpg?width=400',
  'Kia Rio':
    'https://commons.wikimedia.org/wiki/Special:FilePath/2017%20Kia%20Rio%202%201.3%20Front.jpg?width=400',
  'Honda Civic':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Honda%20Civic%20%282021%29%20sedan%20Sport%20DSC%207054.jpg?width=400',
  'Mazda Mazda3':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Mazda3%20%28BN%29%201X7A7262.jpg?width=400',
  'Honda Accord':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Honda%20Accord%20CV3%20e-HEV%20EX.jpg?width=400',
  'Hyundai Sonata':
    'https://commons.wikimedia.org/wiki/Special:FilePath/0%20Hyundai%20Sonata%20%28DN8%29fl%201.jpg?width=400',
  'Nissan Altima':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Nissan%20Altima%20%28L33%29%20Facelift%20DSC%207882.jpg?width=400',
  'Ford Fusion':
    'https://commons.wikimedia.org/wiki/Special:FilePath/2019%20Ford%20Fusion%20%282nd%20generation%29%201X7A0334.jpg?width=400',
  'Honda CR-V':
    'https://commons.wikimedia.org/wiki/Special:FilePath/2023%20Honda%20CR-V%20EX-L%204WD%20in%20Radiant%20Red%20Metallic%2C%20rear%20right.jpg?width=400',
  'Ford Escape':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ford%20Escape%20%28fourth%20generation%29%201X7A6227.jpg?width=400',
  'Mercedes-Benz C-Class':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Mercedes-Benz%20C-Class%20All-Terrain%20IMG%200290.jpg?width=400',
  'Audi A4':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Audi%20A4%20B9%20sedans%20%28FL%29%201X7A6816.jpg?width=400',
  'Chevrolet Camaro':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chevrolet%20Camaro%20Hirschaid%202022-20220709-RM-111908.jpg?width=400',
  'Mazda MX-5':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Mazda%20MX-5%20%28ND%29%201X7A7471.jpg?width=400',
  'Honda Odyssey':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Honda%20ODYSSEY%20ABSOLUTE%20EX%20%28RC1%29%20front.jpg?width=400',
  'Toyota Sienna':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Toyota%20Sienna%20%28XL30%29%20DSC%202916.jpg?width=400',
  'Chevrolet Silverado':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chevrolet%20C-K%20Silverado%20Hirschaid%202022-20220709-RM-110037.jpg?width=400',
  'Ram 1500':
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ram%201500%20%28DT%29%20Hirschaid%202022-20220709-RM-111330.jpg?width=400',
};
