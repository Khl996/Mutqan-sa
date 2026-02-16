
import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

// Ensure these environment variables are set
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkSubscriptions() {
    console.log("Starting subscription check...");
    const now = new Date();

    // Find active subscriptions where current period has ended
    const { data: expiredSubs, error } = await supabase
        .from("tenant_subscriptions")
        .select("*")
        .eq("status", "active")
        .lt("current_period_end", now.toISOString());

    if (error) {
        console.error("Error fetching subscriptions:", error);
        return;
    }

    console.log(`Found ${expiredSubs.length} subscriptions past their period end.`);

    for (const sub of expiredSubs) {
        if (sub.cancel_at_period_end) {
            // Logic: User requested cancellation at end of period. So cancel it now.
            console.log(`Cancelling subscription ${sub.id} for tenant ${sub.tenant_id}`);

            const { error: updateError } = await supabase
                .from("tenant_subscriptions")
                .update({
                    status: "cancelled",
                    cancelled_at: now.toISOString(),
                    updated_at: now.toISOString()
                })
                .eq("id", sub.id);

            if (updateError) console.error(`Error updating subscription ${sub.id}:`, updateError);

            // Update tenant status to reflect cancellation
            await supabase
                .from("tenants")
                .update({
                    subscription_status: "cancelled",
                    updated_at: now.toISOString()
                })
                .eq("id", sub.tenant_id);

        } else {
            // Logic: Auto-renew is ON (cancel_at_period_end is false/null).
            // Attempt renewal or mark as past_due if payment fails (mocked here as past_due)
            console.log(`Subscription ${sub.id} needs renewal. Marking as past_due pending payment.`);

            await supabase
                .from("tenant_subscriptions")
                .update({
                    status: "past_due",
                    updated_at: now.toISOString()
                })
                .eq("id", sub.id);

            await supabase
                .from("tenants")
                .update({
                    subscription_status: "past_due",
                    updated_at: now.toISOString()
                })
                .eq("id", sub.tenant_id);
        }
    }
    console.log("Subscription check completed.");
}

checkSubscriptions();
