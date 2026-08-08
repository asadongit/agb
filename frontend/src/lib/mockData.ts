import { PublicMenuResponse } from "@/types";

export const MOCK_MENU: PublicMenuResponse = {
  restaurant_name: "ApnaGreen Basket",
  restaurant_slug: "apnagreenbasket-jammu",
  payment_mode: "BOTH",
  categories: [
    {
      id: "417cc939-5ca0-4e3b-96e9-41b89471c68a",
      name: "Fresh Farm Produce",
      display_order: 1,
      items: [
        {
          id: "63fd6136-e31e-40cb-900f-f323c6337e8c",
          name: "Organic Jammu Tomatoes",
          description: "Freshly harvested vine-ripened red organic tomatoes sourced directly from Jammu farms.",
          price: "40.00",
          pricing_mode: "WEIGHT_BASED",
          unit_label: "kg",
          image_url:
            "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [
            {
              id: "79c7d3ac-43c6-4566-a9a7-55b25cd2f01a",
              name: "500g Pack",
              price_delta: "0.00",
              is_available: true,
            },
            {
              id: "60d28a38-4bed-4a58-a283-3377b5e449cb",
              name: "1kg Pack",
              price_delta: "20.00",
              is_available: true,
            },
          ],
        },
        {
          id: "a11ab7fa-3cf8-459a-993c-8804d51e061d",
          name: "Fresh Local Pumpkin",
          description: "Single whole farm-fresh sweet pumpkin sold on exact weight basis.",
          price: "35.00",
          pricing_mode: "WEIGHT_BASED",
          unit_label: "kg",
          image_url:
            "https://images.unsplash.com/photo-1570586437263-ab629fccc818?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
      ],
    },
    {
      id: "327df889-f6de-4d1a-acbc-f425e4226ac1",
      name: "Dairy & Staples",
      display_order: 2,
      items: [
        {
          id: "8bec85a4-7ed8-437c-97a6-e97b084d9696",
          name: "Jammu Special Rajma",
          description: "Premium grade red kidney beans (Bhaderwah Rajma) sourced from Jammu hills.",
          price: "160.00",
          pricing_mode: "WEIGHT_BASED",
          unit_label: "kg",
          image_url:
            "https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
        {
          id: "a5371366-b634-4ff3-ba31-65505a168283",
          name: "Farm Fresh Pasteurized Milk",
          description: "Full cream pure cow milk, chilled 1 Litre pouch.",
          price: "60.00",
          pricing_mode: "FIXED_UNIT",
          unit_label: "1L",
          image_url:
            "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
      ],
    },
    {
      id: "9095eeb1-5e27-4c5c-b229-25598b42df75",
      name: "Organic Drinks & Juices",
      display_order: 3,
      items: [
        {
          id: "f3d3a86b-a37a-490f-953c-5d8d30280494",
          name: "Cold Pressed Hibiscus & Yuzu Juice",
          description: "Organic hibiscus extract, fresh citrus yuzu, and natural mint water.",
          price: "120.00",
          pricing_mode: "FIXED_UNIT",
          unit_label: "bottle",
          image_url:
            "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
      ],
    },
  ],
};
