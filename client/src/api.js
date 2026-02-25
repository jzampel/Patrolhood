export const safeFetch = async (url, options = {}) => {
    const token = localStorage.getItem('token');

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    try {
        const res = await fetch(url, { ...options, headers });

        // Attempt to get content-type to see if it's JSON
        const contentType = res.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (!res.ok) {
                return { success: false, error: data.message || `Error: ${res.status}`, status: res.status, data };
            }
            return { success: true, ...data };
        } else {
            // Not JSON, probably an HTML error page or generic error
            const text = await res.text();
            console.warn('⚠️ Received non-JSON response from:', url, text.substring(0, 100));
            return {
                success: false,
                error: `Servidor devolvió formato inesperado (${res.status}).`,
                status: res.status
            };
        }
    } catch (err) {
        console.error('❌ Network or Fetch Error:', err);
        return { success: false, error: 'Error de conexión con el servidor.' };
    }
};
