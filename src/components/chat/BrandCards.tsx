'use client';

import { motion } from 'framer-motion';

interface Brand {
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  category: string | null;
}

interface BrandCardsProps {
  brands: Brand[];
  onSelect: (brandName: string) => void;
}

export function BrandCards({ brands, onSelect }: BrandCardsProps) {
  return (
    <div className="w-full">
      <p className="text-sm text-gray-600 mb-3 text-center">בחרי את המותג:</p>
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        {brands.map((brand, index) => (
          <motion.button
            key={brand.brand_name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onSelect(brand.brand_name)}
            className="p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all text-right"
          >
            <p className="font-medium text-gray-900 text-sm">{brand.brand_name}</p>
            {brand.description && (
              <p className="text-xs text-gray-500 mt-1">{brand.description}</p>
            )}
            {brand.coupon_code && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-mono rounded">
                {brand.coupon_code}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}





