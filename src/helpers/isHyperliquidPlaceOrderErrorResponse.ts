interface PlaceOrderErrorResponse {
  status: "ok";
  response: {
    type: "order";
    data: {
      statuses: {
        error: string;
      }[];
    };
  };
}

export function isHyperliquidPlaceOrderErrorResponse(
  error: unknown,
): error is PlaceOrderErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "response" in error &&
    (error as PlaceOrderErrorResponse).status === "ok" &&
    typeof (error as PlaceOrderErrorResponse).response === "object" &&
    (error as PlaceOrderErrorResponse).response !== null &&
    "type" in (error as PlaceOrderErrorResponse).response &&
    (error as PlaceOrderErrorResponse).response["type"] === "order" &&
    "data" in (error as PlaceOrderErrorResponse).response &&
    typeof (error as PlaceOrderErrorResponse).response.data === "object" &&
    (error as PlaceOrderErrorResponse).response.data !== null &&
    "statuses" in (error as PlaceOrderErrorResponse).response.data &&
    Array.isArray((error as PlaceOrderErrorResponse).response.data.statuses) &&
    (error as PlaceOrderErrorResponse).response.data.statuses.length > 0 &&
    typeof (error as PlaceOrderErrorResponse).response.data.statuses[0]
      .error === "string"
  );
}
