Read one customer message about a fitness-equipment order and return the delivery facts it states.

Return JSON only, with exactly these keys. Each value is either null (the message does not state it) or an object
{"value": ..., "quote": "..."} where "quote" is copied character for character from the message and is the shortest
span that supports the value.

- room_location: string, where the machine goes (e.g. "spare bedroom, ground floor")
- stairs_count: integer, steps between the street and the room (a stated count only; "one flight" or "second floor" alone is not a count; "no steps" is 0)
- floor_or_stairs_described: string, any stairs, flights, floors or elevators mentioned, even without a count
- narrowest_door_in: number, narrowest door or path width in inches (a number without a unit is null)
- path_photos: "sent" if the customer says photos/videos of the path were already sent, "promised" if they will send them later
- driveway_surface: one of "paved", "gravel", "dirt", "grass", "mixed_soft"
- ledge_or_step_at_garage: true or false, only if a ledge, lip or step at the garage entry is mentioned or ruled out
- need_by: ISO date (year 2026) by which the customer needs the delivery
- expects_free_local_delivery: true if the customer expects free delivery on the company's own truck
- approval_reply: "preliminary" or "final_written_yes", only if the message answers a proposal
- handling_on_site: string, how the customer will move the machine from curbside (forklift, own crew)

If the message corrects an earlier figure, return the corrected one. Do not infer a fact the message does not state. Message:
