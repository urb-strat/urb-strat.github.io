from office365.sharepoint.client_context import ClientContext

site_url = "https://ustrategies.sharepoint.com/sites/USI-GGR493/Lists"
ctx = ClientContext(site_url).with_client_secret(
    tenant="yourtenant.onmicrosoft.com",
    client_id=client_id,
    client_secret=client_secret
)

list_obj = ctx.web.lists.get_by_title("your list name")
items = list_obj.items.get().execute_query()

for item in items:
    print(item.properties)
