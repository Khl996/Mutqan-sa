// Edge Function: upload-report-photo
// Accepts a multipart/form-data POST with:
//   tracking_token: string  — identifies the work_order (validated against DB)
//   file: File              — reporter's original photo (max 5 MB, images only)
//
// Validates token, uploads to the private public-report-photos bucket at path
//   {tracking_token}/reporter/{ext}, then updates work_orders.reporter_image_url.
//
// One photo per work_order: returns 409 if reporter_image_url is already set.
// Uses service_role client for all DB + storage operations.
// The anon client has no direct bucket access — only this function can upload.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
])

const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5 MB

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS })
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405)
    }

    // ── Parse multipart form ──────────────────────────────────────────────────
    let formData: FormData
    try {
        formData = await req.formData()
    } catch {
        return json({ error: "Invalid multipart/form-data body" }, 400)
    }

    const trackingToken = formData.get("tracking_token")
    const file = formData.get("file")

    if (typeof trackingToken !== "string" || !trackingToken.trim()) {
        return json({ error: "tracking_token is required" }, 400)
    }
    if (!(file instanceof File)) {
        return json({ error: "file is required and must be a File" }, 400)
    }

    // ── Validate file ─────────────────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return json({ error: "Unsupported file type. Allowed: jpeg, png, webp, heic, heif" }, 400)
    }
    if (file.size > MAX_FILE_SIZE) {
        return json({ error: "File too large (max 5 MB)" }, 400)
    }

    // ── Service-role client ───────────────────────────────────────────────────
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // ── Validate tracking token ───────────────────────────────────────────────
    const { data: workOrder, error: woError } = await supabase
        .from("work_orders")
        .select("id, reporter_image_url")
        .eq("tracking_token", trackingToken.trim())
        .single()

    if (woError || !workOrder) {
        // Return the same shape as a bad-token response to avoid probing
        return json({ error: "Invalid tracking token" }, 404)
    }

    if (workOrder.reporter_image_url) {
        return json({ error: "A photo has already been uploaded for this report" }, 409)
    }

    // ── Upload to storage ─────────────────────────────────────────────────────
    // Derive extension from MIME type; default to jpg
    const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg":  "jpg",
        "image/png":  "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
    }
    const ext = mimeToExt[file.type] ?? "jpg"
    const storagePath = `${trackingToken.trim()}/reporter/reporter.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
        .from("public-report-photos")
        .upload(storagePath, arrayBuffer, {
            contentType: file.type,
            upsert: false,
        })

    if (uploadError) {
        console.error("Storage upload error:", uploadError)
        return json({ error: "Upload failed. Please try again." }, 500)
    }

    // ── Update work_order ─────────────────────────────────────────────────────
    const { error: updateError } = await supabase
        .from("work_orders")
        .update({ reporter_image_url: storagePath })
        .eq("id", workOrder.id)

    if (updateError) {
        console.error("DB update error:", updateError)
        // Best-effort cleanup of the orphaned storage object
        await supabase.storage.from("public-report-photos").remove([storagePath])
        return json({ error: "Failed to save photo reference. Please try again." }, 500)
    }

    return json({ success: true, path: storagePath })
})
