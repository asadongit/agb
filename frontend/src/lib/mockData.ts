import { PublicMenuResponse } from "@/types";

export const MOCK_MENU: PublicMenuResponse = {
  restaurant_name: "Oasis Modern Bistro",
  restaurant_slug: "oasis-bistro",
  payment_mode: "BOTH",
  categories: [
    {
      id: "417cc939-5ca0-4e3b-96e9-41b89471c68a",
      name: "Chef's Specials",
      display_order: 1,
      items: [
        {
          id: "63fd6136-e31e-40cb-900f-f323c6337e8c",
          name: "Truffle Parmesan Hand-Cut Fries",
          description:
            "Triple-cooked russet potatoes tossed in black truffle oil, aged Parmigiano-Reggiano, and rosemary garlic aioli.",
          price: "2.00",
          image_url:
            "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [
            {
              id: "79c7d3ac-43c6-4566-a9a7-55b25cd2f01a",
              name: "Regular Portion",
              price_delta: "0.00",
              is_available: true,
            },
            {
              id: "60d28a38-4bed-4a58-a283-3377b5e449cb",
              name: "Sharing Platter",
              price_delta: "160.00",
              is_available: true,
            },
          ],
        },
        {
          id: "a11ab7fa-3cf8-459a-993c-8804d51e061d",
          name: "Wood-Fired Burrata & Heirloom Pizza",
          description:
            "San Marzano tomato base, fresh creamy burrata, heirloom tomatoes, fresh basil, and aged balsamic glaze reduction.",
          price: "680.00",
          image_url:
            "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [
            {
              id: "6d912c2e-6d1f-4a99-b45f-e58051e4079f",
              name: "Personal (10\")",
              price_delta: "0.00",
              is_available: true,
            },
            {
              id: "b0479e38-9cf8-447b-bc34-61244e0481cd",
              name: "Large (14\")",
              price_delta: "240.00",
              is_available: true,
            },
          ],
        },
      ],
    },
    {
      id: "327df889-f6de-4d1a-acbc-f425e4226ac1",
      name: "Gourmet Mains",
      display_order: 2,
      items: [
        {
          id: "8bec85a4-7ed8-437c-97a6-e97b084d9696",
          name: "Smoked Bacon & Wagyu Smash Burger",
          description:
            "Double Wagyu beef patty, applewood smoked bacon, aged cheddar, caramelised onions, and house sauce on toasted brioche.",
          price: "520.00",
          image_url:
            "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
        {
          id: "a5371366-b634-4ff3-ba31-65505a168283",
          name: "Artisan Wild Mushroom Pappardelle",
          description:
            "Handmade pappardelle, porcini cream sauce, toasted pine nuts, fresh thyme, and shaved Parmigiano.",
          price: "580.00",
          image_url:
            "https://images.unsplash.com/photo-1621996346565-e3d5d6281320?auto=format&fit=crop&w=600&q=80",
          is_available: false,
          variants: [],
        },
      ],
    },
    {
      id: "9095eeb1-5e27-4c5c-b229-25598b42df75",
      name: "Artisanal Beverages",
      display_order: 3,
      items: [
        {
          id: "f3d3a86b-a37a-490f-953c-5d8d30280494",
          name: "Iced Hibiscus & Yuzu Sparkler",
          description:
            "Cold-brewed organic hibiscus tea, Japanese yuzu citrus, sparkling mineral water, and mint syrup.",
          price: "240.00",
          image_url:
            "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
          is_available: true,
          variants: [],
        },
      ],
    },
  ],
};
